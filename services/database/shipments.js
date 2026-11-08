import { createHash, randomBytes } from 'node:crypto';
import { databaseUnavailable, execute, createDatabasePool, partnerDatabaseEnv } from './pool.js';
import { HttpError } from '../shared/responses.js';

let pool;
export function getShippingPool() {
  return pool ||= createDatabasePool(partnerDatabaseEnv('shipping'));
}
export async function closeShippingPool() {
  if (pool) await pool.end();
  pool = undefined;
}

export function createShippingRepository(poolProvider = getShippingPool) {
  return {
    async save(shipment) {
      const { requestId, businessId, address, packetCount, packetWeightsPounds } = shipment;
      const hash = createHash('sha256').update(JSON.stringify({ businessId, address, packetCount, packetWeightsPounds })).digest('hex');
      const token = `SHP-${randomBytes(16).toString('hex').toUpperCase()}`;
      try {
        try {
          await execute(poolProvider(), `INSERT INTO SHIPMENT
            (REQUEST_ID, PAYLOAD_HASH, BUSINESS_ID, RECIPIENT_NAME, ADDRESS1, ADDRESS2, CITY, STATE, COUNTRY, POSTAL_CODE, EMAIL, PACKET_COUNT, PACKET_WEIGHTS, CONFIRMATION_TOKEN)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [requestId, hash, businessId, address.name, address.addressLine1, address.addressLine2, address.city,
            address.state, address.country, address.zip, address.email, packetCount, JSON.stringify(packetWeightsPounds), token]);
          return { confirmationToken: token };
        } catch (error) {
          if (error.code !== 'ER_DUP_ENTRY') throw error;
          const [rows] = await execute(poolProvider(),
            'SELECT CONFIRMATION_TOKEN, PAYLOAD_HASH FROM SHIPMENT WHERE REQUEST_ID = ?', [requestId]);
          if (!rows.length) throw error;
          if (rows[0].PAYLOAD_HASH !== hash) throw new HttpError(409, 'SHIPMENT_CONFLICT', 'This request ID already belongs to a different shipment.');
          return { confirmationToken: rows[0].CONFIRMATION_TOKEN };
        }
      } catch (error) {
        if (error instanceof HttpError) throw error;
        throw databaseUnavailable();
      }
    },
  };
}
