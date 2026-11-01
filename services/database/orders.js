import { databaseUnavailable, execute, getDatabasePool } from './pool.js';
import { itemFromRow } from './items.js';
import { buildReceipt } from '../orders/receipt.js';
import { HttpError } from '../shared/responses.js';
import { cardLastFour } from '../shared/validation.js';

export function createOrderRepository(poolProvider = getDatabasePool) {
  return {
    async save({ quantities, payment, shipping }) {
      let connection;
      try {
        connection = await poolProvider().getConnection();
        await execute(connection, 'SET SESSION innodb_lock_wait_timeout = 3');
        await connection.beginTransaction();
        const ids = [...quantities.keys()].sort();
        // Recheck current rows inside the transaction, after the HTTP stock check.
        // Shared locks keep prices/stock stable until all order rows are committed.
        const [rows] = await execute(connection,
          `SELECT * FROM ITEM WHERE SLUG IN (${ids.map(() => '?').join(',')}) ORDER BY ID FOR SHARE`, ids);
        const catalogue = new Map(rows.map(row => [row.SLUG, itemFromRow(row)]));
        const receipt = buildReceipt(quantities, catalogue);
        const [paymentResult] = await execute(connection,
          'INSERT INTO PAYMENT_INFO (HOLDER_NAME, CARD_NUM, EXP_DATE) VALUES (?, ?, ?)',
          [payment.cardHolderName, `****${cardLastFour(payment)}`, payment.expirationDate]);
        const [shippingResult] = await execute(connection,
          'INSERT INTO SHIPPING_INFO (ADDRESS1, ADDRESS2, CITY, STATE, COUNTRY, POSTAL_CODE, EMAIL) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [shipping.addressLine1, shipping.addressLine2, shipping.city, shipping.state, shipping.country, shipping.zip, shipping.email]);
        const [orderResult] = await execute(connection,
          'INSERT INTO CUSTOMER_ORDER (CUSTOMER_NAME, CUSTOMER_EMAIL, SHIPPING_INFO_ID_FK, PAYMENT_INFO_ID_FK) VALUES (?, ?, ?, ?)',
          [shipping.name, shipping.email, shippingResult.insertId, paymentResult.insertId]);
        const rowBySlug = new Map(rows.map(row => [row.SLUG, row]));
        for (const item of receipt.items) {
          const row = rowBySlug.get(item.id);
          await execute(connection,
            'INSERT INTO CUSTOMER_ORDER_LINE_ITEM (ITEM_ID, ITEM_NUMBER, ITEM_NAME, QUANTITY, UNIT_PRICE, CUSTOMER_ORDER_ID_FK) VALUES (?, ?, ?, ?, ?, ?)',
            [row.ID, row.ITEM_NUMBER, row.NAME, item.quantity, row.UNIT_PRICE, orderResult.insertId]);
        }
        await connection.commit();
        return {
          orderId: orderResult.insertId,
          confirmationNumber: `AB-${orderResult.insertId.toString(16).toUpperCase().padStart(8, '0')}`,
          status: 'New',
          ...receipt,
        };
      } catch (error) {
        if (connection) {
          try { await connection.rollback(); } catch { connection.destroy(); }
        }
        if (error instanceof HttpError) throw error;
        throw databaseUnavailable();
      } finally {
        connection?.release();
      }
    },
  };
}
