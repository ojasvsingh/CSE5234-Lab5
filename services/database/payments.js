import { randomBytes } from 'node:crypto';
import { databaseUnavailable, execute, createDatabasePool } from './pool.js';
import { cardLastFour } from '../shared/validation.js';
import { HttpError } from '../shared/responses.js';

let pool;
export function getPaymentPool() {
  return pool ||= createDatabasePool({ ...process.env, DB_NAME: process.env.PAYMENT_DB_NAME || 'adventure_payment' });
}
export async function closePaymentPool() {
  if (pool) await pool.end();
  pool = undefined;
}

export function createPaymentRepository(poolProvider = getPaymentPool) {
  return {
    async save(payment) {
      const token = `PAY-${randomBytes(4).toString('hex').toUpperCase()}`;
      try {
        await execute(poolProvider(),
          'INSERT INTO PAYMENT_INFO (HOLDER_NAME, CARD_NUM, EXP_DATE, CONFIRMATION_TOKEN) VALUES (?, ?, ?, ?)',
          [payment.cardHolderName, `****${cardLastFour(payment)}`, payment.expirationDate, token]);
        return { confirmationToken: token };
      } catch (error) {
        if (error instanceof HttpError) throw error;
        throw databaseUnavailable();
      }
    },
  };
}
