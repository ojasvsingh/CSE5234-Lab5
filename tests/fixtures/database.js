import { createDatabasePool } from '../../services/database/pool.js';
import { initializeDatabase } from '../../scripts/database.mjs';

// Deliberately fixed: tests never inherit a development or RDS database target.
export const testDatabaseEnv = {
  DB_HOST: '127.0.0.1', DB_PORT: '33307', DB_NAME: 'adventure_beyond_test',
  DB_USER: 'adventure_test', DB_PASSWORD: 'local-test-password', DB_SSL: 'false',
};
export const createTestPool = () => createDatabasePool(testDatabaseEnv);

export async function prepareTestDatabase() {
  const pool = createTestPool();
  try {
    await initializeDatabase(pool);
  } catch (error) {
    throw new Error('Test database is unavailable. Run npm run db:test:up first.', { cause: error });
  } finally {
    await pool.end();
  }
}
