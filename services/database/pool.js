import '../shared/env.js';
import mysql from 'mysql2/promise';
import awsCaBundle from 'aws-ssl-profiles';
import { readFileSync } from 'node:fs';
import { HttpError } from '../shared/responses.js';

export function databaseConfig(env = process.env) {
  const sslMode = env.DB_SSL || 'false';
  if (!['false', 'true', 'rds'].includes(sslMode)) throw new Error('DB_SSL must be false, true, or rds.');
  const host = env.DB_HOST || '127.0.0.1';
  if (sslMode === 'false' && !['127.0.0.1', 'localhost', '::1'].includes(host)) {
    throw new Error('Remote databases require DB_SSL=true or DB_SSL=rds.');
  }
  return {
    host,
    port: Number(env.DB_PORT || 33306),
    database: env.DB_NAME || 'adventure_beyond',
    user: env.DB_USER || 'adventure',
    password: env.DB_PASSWORD || 'local-demo-password',
    ssl: sslMode === 'rds' ? { ca: awsCaBundle.ca, rejectUnauthorized: true, verifyIdentity: true } : sslMode === 'true'
      ? { rejectUnauthorized: true, verifyIdentity: true, ...(env.DB_SSL_CA ? { ca: readFileSync(env.DB_SSL_CA, 'utf8') } : {}) } : undefined,
    connectionLimit: 4,
    maxIdle: 2,
    idleTimeout: 10000,
    connectTimeout: 3000,
    waitForConnections: true,
    queueLimit: 20,
    multipleStatements: false,
    charset: 'utf8mb4',
    timezone: 'Z',
    decimalNumbers: false,
  };
}

export function createDatabasePool(env = process.env) {
  return mysql.createPool(databaseConfig(env));
}

// Partners never inherit the storefront's database credentials.
export function partnerDatabaseEnv(kind, env = process.env) {
  const prefix = kind.toUpperCase();
  return {
    DB_HOST: env[`${prefix}_DB_HOST`] || '127.0.0.1',
    DB_PORT: env[`${prefix}_DB_PORT`] || '33306',
    DB_NAME: env[`${prefix}_DB_NAME`] || `adventure_${kind}`,
    DB_USER: env[`${prefix}_DB_USER`] || `adventure_${kind}`,
    DB_PASSWORD: env[`${prefix}_DB_PASSWORD`] || `local-${kind}-password`,
    DB_SSL: env[`${prefix}_DB_SSL`] || 'false',
    DB_SSL_CA: env[`${prefix}_DB_SSL_CA`],
  };
}

// Connects without selecting a database so setup can create one.
export function createServerConnection(env = process.env) {
  const { host, port, user, password, ssl, connectTimeout } = databaseConfig(env);
  return mysql.createConnection({ host, port, user, password, ssl, connectTimeout, multipleStatements: false });
}

let sharedPool;
export function getDatabasePool() {
  return sharedPool ||= createDatabasePool();
}
export async function closeDatabasePool() {
  if (sharedPool) await sharedPool.end();
  sharedPool = undefined;
}
export function databaseUnavailable() {
  return new HttpError(503, 'DATABASE_UNAVAILABLE', 'The database is unavailable. We could not confirm this request. Please try again.');
}
export async function execute(connection, sql, values = []) {
  return connection.execute({ sql, timeout: 5000 }, values);
}
