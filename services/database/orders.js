import { databaseUnavailable, execute, getDatabasePool } from './pool.js';
import { itemFromRow } from './items.js';
import { buildReceipt } from '../orders/receipt.js';
import { HttpError } from '../shared/responses.js';
import { randomUUID } from 'node:crypto';
import { buildShipmentEvent } from '../orders/shipment.js';

async function lockedReceipt(connection, quantities) {
  const ids = [...quantities.keys()].sort();
  // Shared locks keep prices and stock stable until the transaction ends.
  const [rows] = await execute(connection,
    `SELECT * FROM ITEM WHERE SLUG IN (${ids.map(() => '?').join(',')}) ORDER BY ID FOR SHARE`, ids);
  const catalogue = new Map(rows.map(row => [row.SLUG, itemFromRow(row)]));
  return { rows, receipt: buildReceipt(quantities, catalogue) };
}

export function createOrderRepository(poolProvider = getDatabasePool) {
  return {
    async ensureAvailable(quantities) {
      let connection;
      try {
        connection = await poolProvider().getConnection();
        await execute(connection, 'SET SESSION innodb_lock_wait_timeout = 3');
        await connection.beginTransaction();
        await lockedReceipt(connection, quantities);
        await connection.rollback();
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
    async save({ quantities, shipping, paymentToken, businessId }) {
      let connection;
      try {
        connection = await poolProvider().getConnection();
        await execute(connection, 'SET SESSION innodb_lock_wait_timeout = 3');
        await connection.beginTransaction();
        const { rows, receipt } = await lockedReceipt(connection, quantities);
        // Card data stays in the payment service. This store keeps its token only.
        const [shippingResult] = await execute(connection,
          'INSERT INTO SHIPPING_INFO (ADDRESS1, ADDRESS2, CITY, STATE, COUNTRY, POSTAL_CODE, EMAIL) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [shipping.addressLine1, shipping.addressLine2, shipping.city, shipping.state, shipping.country, shipping.zip, shipping.email]);
        const [orderResult] = await execute(connection,
          'INSERT INTO CUSTOMER_ORDER (CUSTOMER_NAME, CUSTOMER_EMAIL, SHIPPING_INFO_ID_FK, PAYMENT_INFO_ID_FK, PAYMENT_CONFIRMATION_TOKEN) VALUES (?, ?, ?, NULL, ?)',
          [shipping.name, shipping.email, shippingResult.insertId, paymentToken]);
        const rowBySlug = new Map(rows.map(row => [row.SLUG, row]));
        for (const item of receipt.items) {
          const row = rowBySlug.get(item.id);
          await execute(connection,
            'INSERT INTO CUSTOMER_ORDER_LINE_ITEM (ITEM_ID, ITEM_NUMBER, ITEM_NAME, QUANTITY, UNIT_PRICE, CUSTOMER_ORDER_ID_FK) VALUES (?, ?, ?, ?, ?, ?)',
            [row.ID, row.ITEM_NUMBER, row.NAME, item.quantity, row.UNIT_PRICE, orderResult.insertId]);
        }
        const saved = {
          orderId: orderResult.insertId,
          confirmationNumber: `AB-${orderResult.insertId.toString(16).toUpperCase().padStart(8, '0')}`,
          status: 'New',
          ...receipt,
        };
        const eventId = randomUUID();
        const detail = buildShipmentEvent({ shipping, receipt: saved, requestId: eventId, businessId });
        await execute(connection, 'INSERT INTO SHIPMENT_OUTBOX (ORDER_ID, EVENT_ID, DETAIL) VALUES (?, ?, ?)',
          [saved.orderId, eventId, JSON.stringify(detail)]);
        await connection.commit();
        return saved;
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
