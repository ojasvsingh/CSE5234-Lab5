import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createDatabasePool } from '../services/database/pool.js';
import { initializeDatabase } from './database.mjs';
import { inspectDatabase } from './inspect-database.mjs';

// AWS credentials stay in the CLI's SSO cache. Administrator DB credentials
// are read into memory only, never printed or saved in the app's environment.
export function openRdsAdmin() {
  const profile = process.env.RDS_AWS_PROFILE || 'school';
  const region = process.env.RDS_AWS_REGION || 'us-east-1';
  const stack = process.env.RDS_STACK || 'adventure-beyond-lab8-rds';
  const aws = (...args) => JSON.parse(execFileSync('aws', [
    ...args, '--profile', profile, '--region', region, '--output', 'json',
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  const state = aws('cloudformation', 'describe-stacks', '--stack-name', stack).Stacks[0];
  if (!['CREATE_COMPLETE', 'UPDATE_COMPLETE', 'UPDATE_ROLLBACK_COMPLETE'].includes(state.StackStatus)) {
    throw Object.assign(new Error(), { code: 'RDS_STACK_NOT_READY' });
  }
  const outputs = Object.fromEntries(state.Outputs.map(item => [item.OutputKey, item.OutputValue]));
  const secret = JSON.parse(aws('secretsmanager', 'get-secret-value', '--secret-id', outputs.AdminSecretArn).SecretString);
  const env = {
    DB_HOST: outputs.DatabaseHost,
    DB_PORT: outputs.DatabasePort || '3306',
    DB_NAME: outputs.DatabaseName,
    DB_USER: secret.username,
    DB_PASSWORD: secret.password,
    DB_SSL: 'rds',
  };
  return { pool: createDatabasePool(env), env, outputs };
}

async function setup(pool, env) {
  await initializeDatabase(pool);
  const path = new URL('../.env.rds', import.meta.url);
  let app;
  if (existsSync(path)) {
    app = parseEnv(readFileSync(path, 'utf8'));
    if (app.DB_HOST !== env.DB_HOST || app.DB_NAME !== env.DB_NAME
        || app.DB_USER !== 'adventure_app' || app.DB_SSL !== 'rds' || !app.DB_PASSWORD) {
      throw Object.assign(new Error(), { code: 'EXISTING_RDS_CONFIG_MISMATCH' });
    }
    chmodSync(path, 0o600);
  } else {
    app = { ...env, DB_USER: 'adventure_app', DB_PASSWORD: randomBytes(32).toString('base64url') };
    // Save before DCL so an interrupted setup can safely reuse the same password.
    writeFileSync(path, Object.entries(app).map(([key, value]) => `${key}=${value}`).join('\n') + '\n',
      { mode: 0o600, flag: 'wx' });
  }
  await pool.query("CREATE USER IF NOT EXISTS 'adventure_app'@'%' IDENTIFIED BY ? REQUIRE SSL", [app.DB_PASSWORD]);
  await pool.query("GRANT SELECT ON ??.ITEM TO 'adventure_app'@'%'", [env.DB_NAME]);
  for (const table of ['CUSTOMER_ORDER', 'CUSTOMER_ORDER_LINE_ITEM', 'PAYMENT_INFO', 'SHIPPING_INFO']) {
    await pool.query("GRANT INSERT ON ??.?? TO 'adventure_app'@'%'", [env.DB_NAME, table]);
  }
  const appPool = createDatabasePool(app);
  try {
    const [[items]] = await appPool.query('SELECT COUNT(*) AS count FROM ITEM');
    console.log(`RDS ready: ${items.count} products. Restricted application credentials saved to ignored .env.rds.`);
    console.log('Start with npm run dev:rds. Use npm run rds:inspect for saved orders.');
  } finally {
    await appPool.end();
  }
}

async function manual(pool) {
  const connection = await pool.getConnection();
  try {
    const sql = readFileSync(new URL('../database/003-manual-check.sql', import.meta.url), 'utf8');
    for (const statement of sql.replace(/^--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean)) {
      const [rows] = await connection.query(statement);
      if (Array.isArray(rows)) console.table(rows);
    }
    console.log('Manual insert example completed and rolled back.');
  } finally {
    await connection.rollback();
    connection.release();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  let pool;
  try {
    const mode = process.argv[2];
    if (!['setup', 'inspect', 'manual'].includes(mode)) {
      throw Object.assign(new Error(), { code: 'USE_SETUP_INSPECT_OR_MANUAL' });
    }
    const admin = openRdsAdmin();
    pool = admin.pool;
    if (mode === 'setup') await setup(pool, admin.env);
    if (mode === 'inspect') await inspectDatabase(pool);
    if (mode === 'manual') await manual(pool);
  } catch (error) {
    // Do not print AWS subprocess output or SQL errors containing credentials.
    console.error(`RDS operation failed (${error.code || 'AWS_OR_CONFIGURATION_ERROR'}). Check SSO login, stack status, network/IP, and permissions.`);
    process.exitCode = 1;
  } finally {
    if (pool) await pool.end();
  }
}
