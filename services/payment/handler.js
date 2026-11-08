import { createPaymentRepository } from '../database/payments.js';
import { HttpError, json, parseJson } from '../shared/responses.js';
import { emptyPayment, validatePayment } from '../shared/validation.js';
import { lambdaAdapter } from '../shared/lambda.js';

function readPayment(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'INVALID_PAYMENT', 'Payment details must be an object.');
  const payment = {};
  for (const key of Object.keys(emptyPayment)) {
    if (typeof body[key] !== 'string' || body[key].length > 200) {
      throw new HttpError(400, 'INVALID_PAYMENT', `payment.${key} must be a string of at most 200 characters.`);
    }
    payment[key] = body[key].trim();
  }
  const fields = validatePayment(payment);
  if (Object.keys(fields).length) throw new HttpError(400, 'INVALID_PAYMENT', 'Check the payment details.', { fields });
  return payment;
}

export function createPaymentRoute(repository = createPaymentRepository()) {
  return async (request) => {
    if (request.path === '/health' && request.method === 'GET') return json(200, { service: 'payment-processing', status: 'ok' });
    if (request.path !== '/payment') throw new HttpError(404, 'NOT_FOUND', 'This payment endpoint does not exist.');
    if (request.method !== 'POST') return json(405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST to submit a payment.' } }, { Allow: 'POST, OPTIONS' });
    const saved = await repository.save(readPayment(parseJson(request)));
    return json(201, saved);
  };
}

export const handler = lambdaAdapter(createPaymentRoute());
