import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createDatabasePool } from '../services/database/pool.js';

export async function initializeDatabase(pool) {
  for (const file of ['001-schema.sql', '002-seed.sql']) {
    const sql = await readFile(new URL(`../database/${file}`, import.meta.url), 'utf8');
    // These maintained scripts contain simple statements, not stored procedures.
    for (const statement of sql.replace(/^--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean)) {
      await pool.query(statement);
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const pool = createDatabasePool();
  try {
    await initializeDatabase(pool);
    const [[row]] = await pool.query('SELECT COUNT(*) AS count FROM ITEM');
    console.log(`Database ready: ${row.count} warehouse items. Existing data was preserved.`);
  } catch (error) {
    console.error(`Database setup failed (${error.code || 'configuration error'}). Check Docker, .env, and database permissions.`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
