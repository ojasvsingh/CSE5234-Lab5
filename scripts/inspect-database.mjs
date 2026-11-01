import { createDatabasePool } from '../services/database/pool.js';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export async function inspectDatabase(pool) {
  const [items] = await pool.query('SELECT ID, ITEM_NUMBER, SLUG, NAME, AVAILABLE_QUANTITY, UNIT_PRICE FROM ITEM ORDER BY ITEM_NUMBER');
  console.log('Warehouse items');
  console.table(items);
  const [orders] = await pool.query(`SELECT o.ID, CONCAT('AB-', LPAD(HEX(o.ID), 8, '0')) AS CONFIRMATION,
    o.STATUS, COUNT(li.ID) AS LINE_COUNT, SUM(li.QUANTITY * li.UNIT_PRICE) AS TOTAL, o.CREATED_AT
    FROM CUSTOMER_ORDER o JOIN CUSTOMER_ORDER_LINE_ITEM li ON li.CUSTOMER_ORDER_ID_FK = o.ID
    GROUP BY o.ID ORDER BY o.ID DESC LIMIT 10`);
  console.log('Latest saved orders (customer details omitted)');
  console.table(orders);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const pool = createDatabasePool();
  try {
    await inspectDatabase(pool);
  } catch (error) {
    console.error(`Cannot inspect the database (${error.code || 'configuration error'}). Check Docker and .env.`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
