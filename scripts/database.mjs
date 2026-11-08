import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createDatabasePool, createServerConnection } from '../services/database/pool.js';

async function runSqlFile(pool, url) {
  const sql = await readFile(url, 'utf8');
  // These maintained scripts contain simple statements, not stored procedures.
  for (const statement of sql.replace(/^--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean)) {
    await pool.query(statement);
  }
}

export async function initializeDatabase(pool) {
  for (const file of ['001-schema.sql', '002-seed.sql']) {
    await runSqlFile(pool, new URL(`../database/${file}`, import.meta.url));
  }
  const [columns] = await pool.query(
    `SELECT COLUMN_NAME, IS_NULLABLE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'CUSTOMER_ORDER'
       AND COLUMN_NAME IN ('PAYMENT_CONFIRMATION_TOKEN', 'PAYMENT_INFO_ID_FK')`);
  const byName = new Map(columns.map(row => [row.COLUMN_NAME, row]));
  if (!byName.has('PAYMENT_CONFIRMATION_TOKEN')) {
    await pool.query('ALTER TABLE CUSTOMER_ORDER ADD COLUMN PAYMENT_CONFIRMATION_TOKEN VARCHAR(16) NULL');
  }
  if (byName.get('PAYMENT_INFO_ID_FK')?.IS_NULLABLE === 'NO') {
    await pool.query('ALTER TABLE CUSTOMER_ORDER MODIFY PAYMENT_INFO_ID_FK INT UNSIGNED NULL');
  }
}

export async function initializeServiceDatabase(pool, kind) {
  const file = kind === 'payment' ? '../database/payment/001-schema.sql' : '../database/shipping/001-schema.sql';
  await runSqlFile(pool, new URL(file, import.meta.url));
}

async function ensureDatabase(env, name) {
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(name)) throw new Error(`Invalid database name: ${name}`);
  const connection = await createServerConnection(env);
  try {
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${name}\``);
  } catch (error) {
    if (error.code === 'ER_DBACCESS_DENIED_ERROR' || error.code === 'ER_ACCESS_DENIED_ERROR') {
      const user = env.DB_USER || 'adventure';
      console.error(`Cannot create ${name}. In a MySQL root session, run:\nCREATE DATABASE IF NOT EXISTS ${name};\nGRANT ALL PRIVILEGES ON ${name}.* TO '${user}'@'127.0.0.1';\nFLUSH PRIVILEGES;`);
    }
    throw error;
  } finally {
    await connection.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const pool = createDatabasePool();
  const partners = [
    [process.env.PAYMENT_DB_NAME || 'adventure_payment', 'payment'],
    [process.env.SHIPPING_DB_NAME || 'adventure_shipping', 'shipping'],
  ];
  try {
    await initializeDatabase(pool);
    const [[row]] = await pool.query('SELECT COUNT(*) AS count FROM ITEM');
    console.log(`Database ready: ${row.count} warehouse items. Existing data was preserved.`);
    for (const [name, kind] of partners) {
      await ensureDatabase(process.env, name);
      const partner = createDatabasePool({ ...process.env, DB_NAME: name });
      try {
        await initializeServiceDatabase(partner, kind);
        console.log(`${kind} database ready: ${name}`);
      } finally {
        await partner.end();
      }
    }
  } catch (error) {
    console.error(`Database setup failed (${error.code || 'configuration error'}). Check MySQL, .env, and database permissions.`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
