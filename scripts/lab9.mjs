import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, chmodSync, mkdirSync, rmSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { setTimeout } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { openRdsAdmin, setup as setupStore } from './rds.mjs';
import { provisionPartner } from './database.mjs';
import { createDatabasePool, partnerDatabaseEnv } from '../services/database/pool.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const profile = process.env.RDS_AWS_PROFILE || 'school';
const region = process.env.RDS_AWS_REGION || 'us-east-1';
const stackName = 'adventure-beyond-lab9';
const envPath = resolve(root, '.env.lab9');
const build = resolve(root, '.lab9-build');
function awsText(...args) {
  return execFileSync('aws', [...args, '--profile', profile, '--region', region, '--output', 'json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 10 * 1024 * 1024 });
}
function aws(...args) {
  const result = awsText(...args);
  return result.trim() ? JSON.parse(result) : {};
}
function checkAccount() {
  if (profile !== 'school' || aws('sts', 'get-caller-identity').Account !== '358148451783') {
    throw new Error('USE_AUTHORIZED_SCHOOL_ACCOUNT');
  }
}
function readConfig() {
  if (!existsSync(envPath)) throw new Error('RUN_LAB9_SETUP_FIRST');
  chmodSync(envPath, 0o600);
  return parseEnv(readFileSync(envPath, 'utf8'));
}
function saveConfig(env) {
  writeFileSync(envPath, Object.entries(env).map(([key, value]) => `${key}=${JSON.stringify(String(value))}`).join('\n') + '\n', { mode: 0o600 });
  chmodSync(envPath, 0o600);
}
function outputs(stack) {
  return Object.fromEntries((stack.Outputs || []).map(item => [item.OutputKey, item.OutputValue]));
}
function findStack(name) {
  try { return aws('cloudformation', 'describe-stacks', '--stack-name', name).Stacks[0]; }
  catch (error) {
    if (String(error.stderr).includes('does not exist')) return null;
    throw error;
  }
}
async function setup() {
  checkAccount();
  const admin = openRdsAdmin();
  try {
    await setupStore(admin.pool, admin.env);
    const store = parseEnv(readFileSync(resolve(root, '.env.rds'), 'utf8'));
    let env = existsSync(envPath) ? readConfig() : {
      ...store, RDS_AWS_PROFILE: profile, RDS_AWS_REGION: region,
      STORE_BUSINESS_ID: 'AB-STORE-1001', PARTNER_MODE: 'aws', EVENT_TRANSPORT: 'aws',
    };
    if (env.DB_HOST !== admin.env.DB_HOST || env.DB_NAME !== admin.env.DB_NAME) throw new Error('RDS_CONFIG_MISMATCH');
    // Persist generated credentials before creating users so interrupted setup is repeatable.
    for (const kind of ['payment', 'shipping']) {
      const prefix = kind.toUpperCase();
      if (!env[`${prefix}_DB_PASSWORD`]) {
        for (const [key, value] of Object.entries({
          DB_HOST: admin.env.DB_HOST, DB_PORT: admin.env.DB_PORT, DB_NAME: `adventure_${kind}`,
          DB_USER: `adventure_${kind}`, DB_PASSWORD: randomBytes(32).toString('base64url'), DB_SSL: 'rds',
        })) env[`${prefix}_${key}`] = value;
      }
    }
    saveConfig(env);
    for (const kind of ['payment', 'shipping']) {
      const app = partnerDatabaseEnv(kind, env);
      if (app.DB_HOST !== admin.env.DB_HOST || app.DB_PORT !== admin.env.DB_PORT) throw new Error('PARTNER_HOST_MISMATCH');
      await provisionPartner(admin.env, kind, app);
      const pool = createDatabasePool(app);
      try { await pool.query('SELECT 1'); } finally { await pool.end(); }
      console.log(`${kind}: separate database and restricted account ready.`);
    }
    console.log('Private settings saved to ignored .env.lab9. Next: npm run lab9:deploy.');
  } finally { await admin.pool.end(); }
}
async function applyStack(name, template, parameters = {}) {
  const current = findStack(name);
  if (current && !['CREATE_COMPLETE', 'UPDATE_COMPLETE', 'UPDATE_ROLLBACK_COMPLETE'].includes(current.StackStatus)) {
    throw new Error('STACK_REQUIRES_ATTENTION');
  }
  mkdirSync(build, { recursive: true, mode: 0o700 });
  const inputPath = resolve(build, 'stack-input.json');
  writeFileSync(inputPath, JSON.stringify({
    StackName: name, TemplateBody: template, Capabilities: ['CAPABILITY_IAM', 'CAPABILITY_AUTO_EXPAND'],
    Parameters: Object.entries(parameters).map(([ParameterKey, ParameterValue]) => ({ ParameterKey, ParameterValue })),
  }), { mode: 0o600 });
  try {
    aws('cloudformation', current ? 'update-stack' : 'create-stack', '--cli-input-json', `file://${inputPath}`);
  } catch (error) {
    if (current && String(error.stderr).includes('No updates are to be performed')) return outputs(current);
    throw error;
  } finally { rmSync(inputPath, { force: true }); }
  let previous = '';
  for (let attempt = 0; attempt < 240; attempt++) {
    const state = findStack(name);
    const status = state?.StackStatus || 'PENDING';
    if (status !== previous) { console.log(`${name}: ${status}`); previous = status; }
    if (['CREATE_COMPLETE', 'UPDATE_COMPLETE'].includes(status)) return outputs(state);
    if (/FAILED|ROLLBACK/.test(status)) throw new Error('STACK_DEPLOYMENT_FAILED');
    await setTimeout(5000);
  }
  throw new Error('STACK_WAIT_TIMED_OUT');
}
async function deploy() {
  checkAccount();
  const env = readConfig();
  const rds = findStack(process.env.RDS_STACK || 'adventure-beyond-lab8-rds');
  if (!rds) throw new Error('RDS_STACK_MISSING');
  const rdsOutputs = outputs(rds);
  if (env.DB_HOST !== rdsOutputs.DatabaseHost) throw new Error('RDS_CONFIG_MISMATCH');
  const rdsParams = Object.fromEntries(rds.Parameters.map(p => [p.ParameterKey, p.ParameterValue]));
  const artifacts = await applyStack(`${stackName}-artifacts`, readFileSync(resolve(root, 'infra/lab9-artifacts.yaml'), 'utf8'));
  const packaged = resolve(build, 'packaged.yaml');
  // Dependencies are pure JavaScript; install from services/package-lock.json before packaging.
  execFileSync('npm', ['ci', '--omit=dev', '--prefix', 'services'], { cwd: root, stdio: 'inherit' });
  awsText('cloudformation', 'package', '--template-file', resolve(root, 'infra/lab9.yaml'),
    '--s3-bucket', artifacts.BucketName, '--s3-prefix', 'lab9', '--output-template-file', packaged);
  const parameters = {
    VpcId: rdsParams.VpcId, SubnetIds: rdsParams.SubnetIds,
    DatabaseSecurityGroupId: rdsOutputs.DatabaseSecurityGroupId,
  };
  for (const kind of ['Payment', 'Shipping']) {
    const prefix = kind.toUpperCase();
    for (const key of ['Host', 'Name', 'User', 'Password']) {
      parameters[`${kind}Database${key}`] = env[`${prefix}_DB_${key.toUpperCase()}`];
    }
  }
  const result = await applyStack(stackName, readFileSync(packaged, 'utf8'), parameters);
  saveConfig({
    ...env, PARTNER_MODE: 'aws', EVENT_TRANSPORT: 'aws',
    PAYMENT_SERVICE_URL: result.PaymentApiUrl, SHIPPING_SERVICE_URL: result.ShippingApiUrl,
    EVENT_BUS_NAME: result.EventBusName, SHIPPING_TOPIC_ARN: result.ShippingTopicArn,
  });
  writeFileSync(resolve(build, 'outputs.json'), JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
  console.log('Lab 9 deployed. Start the storefront and publisher with npm run dev:aws.');
}
export async function inspectLab9(store, payment, shipping) {
  const [orders] = await store.query(`SELECT o.ID, o.STATUS, o.PAYMENT_CONFIRMATION_TOKEN,
    b.EVENT_ID, b.PUBLISHED_AT, b.ATTEMPTS, b.LAST_ERROR_CODE
    FROM CUSTOMER_ORDER o JOIN SHIPMENT_OUTBOX b ON b.ORDER_ID = o.ID ORDER BY o.ID DESC LIMIT 10`);
  const [payments] = await payment.query('SELECT ID, CONFIRMATION_TOKEN FROM PAYMENT_INFO ORDER BY ID DESC LIMIT 10');
  const [shipments] = await shipping.query('SELECT ID, REQUEST_ID, BUSINESS_ID, PACKET_COUNT, PACKET_WEIGHTS, CONFIRMATION_TOKEN FROM SHIPMENT ORDER BY ID DESC LIMIT 10');
  return { orders, payments, shipments };
}
async function inspect() {
  let env = process.env;
  let store;
  if (process.argv.includes('--aws')) {
    checkAccount();
    env = readConfig();
    store = openRdsAdmin().pool;
  } else store = createDatabasePool(env);
  const payment = createDatabasePool(partnerDatabaseEnv('payment', env));
  const shipping = createDatabasePool(partnerDatabaseEnv('shipping', env));
  try {
    const data = await inspectLab9(store, payment, shipping);
    for (const [name, rows] of Object.entries(data)) { console.log(name); console.table(rows); }
  } finally { await Promise.all([store.end(), payment.end(), shipping.end()]); }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const mode = process.argv[2];
    if (mode === 'setup') await setup();
    else if (mode === 'deploy') await deploy();
    else if (mode === 'inspect') await inspect();
    else throw new Error('USE_SETUP_DEPLOY_OR_INSPECT');
  } catch (error) {
    // AWS subprocess errors can contain input parameters. Never echo them.
    const reason = /^[A-Z_]+$/.test(error.message) ? error.message : 'AWS_DATABASE_OR_CONFIGURATION_ERROR';
    console.error(`Lab 9 operation failed (${reason}). Check school SSO, RDS status, network access, and stack events.`);
    process.exitCode = 1;
  }
}
