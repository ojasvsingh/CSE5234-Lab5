import { randomBytes } from 'node:crypto';
import { databaseUnavailable, execute, createDatabasePool, partnerDatabaseEnv } from './pool.js';
import { cardLastFour } from '../shared/validation.js';
import { HttpError } from '../shared/responses.js';

let pool;
export function getPaymentPool() {
  return pool ||= createDatabasePool(partnerDatabaseEnv('payment'));
}
export async function closePaymentPool() {
  if (pool) await pool.end();
  pool = undefined;
}

export function createPaymentRepository(poolProvider = getPaymentPool) {
  return {
    async save(payment) {
      const token = `PAY-${randomBytes(16).toString('hex').toUpperCase()}`;
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
