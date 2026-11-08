import { randomBytes } from 'node:crypto';
import { databaseUnavailable, execute, createDatabasePool } from './pool.js';
import { HttpError } from '../shared/responses.js';

let pool;
export function getShippingPool() {
  return pool ||= createDatabasePool({ ...process.env, DB_NAME: process.env.SHIPPING_DB_NAME || 'adventure_shipping' });
}
export async function closeShippingPool() {
  if (pool) await pool.end();
  pool = undefined;
}

export function createShippingRepository(poolProvider = getShippingPool) {
  return {
    async save(shipment) {
      const token = `SHP-${randomBytes(4).toString('hex').toUpperCase()}`;
      const { address } = shipment;
      try {
        await execute(poolProvider(),
          `INSERT INTO SHIPMENT (BUSINESS_ID, RECIPIENT_NAME, ADDRESS1, ADDRESS2, CITY, STATE, COUNTRY, POSTAL_CODE, EMAIL, PACKET_COUNT, WEIGHT_POUNDS, CONFIRMATION_TOKEN)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [shipment.businessId, address.name, address.addressLine1, address.addressLine2, address.city, address.state,
            address.country, address.zip, address.email, shipment.packetCount, shipment.weightPounds.toFixed(2), token]);
        return { confirmationToken: token };
      } catch (error) {
        if (error instanceof HttpError) throw error;
        throw databaseUnavailable();
      }
    },
  };
}
