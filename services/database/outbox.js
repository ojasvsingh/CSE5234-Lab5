import { getDatabasePool } from './pool.js';

export function createOutboxDispatcher(publish, poolProvider = getDatabasePool) {
  return async () => {
    const connection = await poolProvider().getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query(`SELECT ID, DETAIL FROM SHIPMENT_OUTBOX
        WHERE PUBLISHED_AT IS NULL AND NEXT_ATTEMPT_AT <= CURRENT_TIMESTAMP
        ORDER BY ID LIMIT 1 FOR UPDATE SKIP LOCKED`);
      if (!rows.length) { await connection.rollback(); return 'idle'; }
      const row = rows[0];
      let delivered = false;
      try {
        await publish(typeof row.DETAIL === 'string' ? JSON.parse(row.DETAIL) : row.DETAIL);
        delivered = true;
      } catch {
        // Keep error metadata free of event bodies, addresses, and credentials.
      }
      if (delivered) {
        await connection.execute(`UPDATE SHIPMENT_OUTBOX SET PUBLISHED_AT = CURRENT_TIMESTAMP,
          ATTEMPTS = ATTEMPTS + 1, LAST_ERROR_CODE = NULL WHERE ID = ?`, [row.ID]);
      } else {
        await connection.execute(`UPDATE SHIPMENT_OUTBOX SET ATTEMPTS = ATTEMPTS + 1,
          LAST_ERROR_CODE = 'EVENT_PUBLISH_FAILED', NEXT_ATTEMPT_AT = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 30 SECOND)
          WHERE ID = ?`, [row.ID]);
      }
      await connection.commit();
      return delivered ? 'published' : 'retry';
    } catch (error) {
      try { await connection.rollback(); } catch { connection.destroy(); }
      throw error;
    } finally { connection.release(); }
  };
}
