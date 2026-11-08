import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createDatabasePool, createServerConnection, partnerDatabaseEnv } from '../services/database/pool.js';

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
    await pool.query('ALTER TABLE CUSTOMER_ORDER ADD COLUMN PAYMENT_CONFIRMATION_TOKEN VARCHAR(40) NULL');
  }
  await pool.query('ALTER TABLE CUSTOMER_ORDER MODIFY PAYMENT_CONFIRMATION_TOKEN VARCHAR(40) NULL');
  if (byName.get('PAYMENT_INFO_ID_FK')?.IS_NULLABLE === 'NO') {
    await pool.query('ALTER TABLE CUSTOMER_ORDER MODIFY PAYMENT_INFO_ID_FK INT UNSIGNED NULL');
  }
  await runSqlFile(pool, new URL('../database/004-lab9-outbox.sql', import.meta.url));
}

export async function initializeServiceDatabase(pool, kind) {
  if (!['payment', 'shipping'].includes(kind)) throw new Error('Unknown service database');
  const file = kind === 'payment' ? '../database/payment/001-schema.sql' : '../database/shipping/001-schema.sql';
  await runSqlFile(pool, new URL(file, import.meta.url));
  const table = kind === 'payment' ? 'PAYMENT_INFO' : 'SHIPMENT';
  await pool.query(`ALTER TABLE ${table} MODIFY CONFIRMATION_TOKEN VARCHAR(40) NOT NULL`);
  if (kind === 'shipping') {
    const [columns] = await pool.query("SHOW COLUMNS FROM SHIPMENT");
    const names = new Set(columns.map(row => row.Field));
    if (!names.has('REQUEST_ID')) await pool.query('ALTER TABLE SHIPMENT ADD COLUMN REQUEST_ID VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL UNIQUE');
    if (!names.has('PAYLOAD_HASH')) await pool.query('ALTER TABLE SHIPMENT ADD COLUMN PAYLOAD_HASH CHAR(64) NULL');
    if (!names.has('PACKET_WEIGHTS')) await pool.query('ALTER TABLE SHIPMENT ADD COLUMN PACKET_WEIGHTS JSON NULL');
    if (names.has('WEIGHT_POUNDS')) await pool.query('ALTER TABLE SHIPMENT MODIFY WEIGHT_POUNDS DECIMAL(6,2) NULL');
  }
}

export async function provisionPartner(adminEnv, kind, appEnv) {
  const admin = await createServerConnection(adminEnv);
  let partner;
  try {
    await admin.query('CREATE DATABASE IF NOT EXISTS ??', [appEnv.DB_NAME]);
    partner = createDatabasePool({ ...adminEnv, DB_NAME: appEnv.DB_NAME });
    await initializeServiceDatabase(partner, kind);
    await admin.query("CREATE USER IF NOT EXISTS ?@'%' IDENTIFIED BY ?", [appEnv.DB_USER, appEnv.DB_PASSWORD]);
    if (appEnv.DB_SSL !== 'false') await admin.query("ALTER USER ?@'%' REQUIRE SSL", [appEnv.DB_USER]);
    const table = kind === 'payment' ? 'PAYMENT_INFO' : 'SHIPMENT';
    await admin.query("GRANT SELECT, INSERT ON ??.?? TO ?@'%'", [appEnv.DB_NAME, table, appEnv.DB_USER]);
  } finally {
    if (partner) await partner.end();
    await admin.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const pool = createDatabasePool();
  try {
    if (!['127.0.0.1', 'localhost', '::1'].includes(process.env.DB_HOST || '127.0.0.1')) {
      throw Object.assign(new Error(), { code: 'USE_RDS_SETUP_FOR_REMOTE_DATABASES' });
    }
    await initializeDatabase(pool);
    const [[row]] = await pool.query('SELECT COUNT(*) AS count FROM ITEM');
    console.log(`Database ready: ${row.count} warehouse items. Existing data was preserved.`);
    // Docker's root password is used only during local setup, never by services.
    // Cloud initialization uses rds:setup / lab9:setup instead.
    const adminEnv = { ...process.env, DB_USER: 'root', DB_PASSWORD: process.env.DB_ROOT_PASSWORD || 'local-root-password' };
    for (const kind of ['payment', 'shipping']) {
      const app = partnerDatabaseEnv(kind);
      if (app.DB_HOST !== (process.env.DB_HOST || '127.0.0.1') || app.DB_PORT !== (process.env.DB_PORT || '33306')) {
        throw Object.assign(new Error(), { code: 'PARTNER_SETUP_REQUIRES_SAME_LOCAL_SERVER' });
      }
      await provisionPartner(adminEnv, kind, app);
      console.log(`${kind} database ready with a separate restricted account.`);
    }
  } catch (error) {
    console.error(`Database setup failed (${error.code || 'configuration error'}). Check MySQL, .env, and database permissions.`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
