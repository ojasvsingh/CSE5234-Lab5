import { createShippingRepository } from '../database/shipments.js';
import { HttpError, json, parseJson } from '../shared/responses.js';
import { emptyShipping, validateShipping } from '../shared/validation.js';
import { lambdaAdapter } from '../shared/lambda.js';
import { randomUUID } from 'node:crypto';

export function readShipment(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'INVALID_SHIPMENT', 'A shipment must be an object.');
  if (typeof body.businessId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/.test(body.businessId)) {
    throw new HttpError(400, 'INVALID_SHIPMENT', 'businessId must be 1–64 letters, digits, or hyphens.');
  }
  if (!Number.isSafeInteger(body.packetCount) || body.packetCount < 1 || body.packetCount > 100) {
    throw new HttpError(400, 'INVALID_SHIPMENT', 'packetCount must be a whole number from 1 to 100.');
  }
  if (!Array.isArray(body.packetWeightsPounds) || body.packetWeightsPounds.length !== body.packetCount
      || body.packetWeightsPounds.some(weight => typeof weight !== 'number' || !Number.isFinite(weight)
        || weight <= 0 || weight > 1000 || Math.abs(Math.round(weight * 100) - weight * 100) > 0.000001)) {
    throw new HttpError(400, 'INVALID_SHIPMENT', 'Supply one positive weight per packet, up to two decimal places.');
  }
  const requestId = body.requestId ?? randomUUID();
  if (typeof requestId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/.test(requestId)) {
    throw new HttpError(400, 'INVALID_SHIPMENT', 'requestId must contain 1–64 letters, digits, or hyphens.');
  }
  if (!body.address || typeof body.address !== 'object' || Array.isArray(body.address)) {
    throw new HttpError(400, 'INVALID_SHIPMENT', 'address must be an object.');
  }
  const address = {};
  for (const key of Object.keys(emptyShipping)) {
    const value = body.address[key] ?? (key === 'country' ? 'US' : '');
    if (typeof value !== 'string' || value.length > 200) {
      throw new HttpError(400, 'INVALID_SHIPMENT', `address.${key} must be a string of at most 200 characters.`);
    }
    address[key] = value.trim();
  }
  const fields = validateShipping(address);
  if (Object.keys(fields).length) throw new HttpError(400, 'INVALID_SHIPMENT', 'Check the shipment address.', { fields });
  return { requestId, businessId: body.businessId, packetCount: body.packetCount, packetWeightsPounds: body.packetWeightsPounds, address };
}

export function createShippingRoute(repository = createShippingRepository()) {
  return async (request) => {
    if (request.path === '/health' && request.method === 'GET') return json(200, { service: 'shipping-processing', status: 'ok' });
    if (request.path !== '/shipping') throw new HttpError(404, 'NOT_FOUND', 'This shipping endpoint does not exist.');
    if (request.method !== 'POST') return json(405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST to start a shipment.' } }, { Allow: 'POST, OPTIONS' });
    return json(201, await repository.save(readShipment(parseJson(request))));
  };
}

export function createShippingEventHandler(repository = createShippingRepository()) {
  return async (event, context) => {
    if (context) context.callbackWaitsForEmptyEventLoop = false;
    if (!Array.isArray(event?.Records) || !event.Records.length) throw new Error('INVALID_SNS_EVENT');
    const results = [];
    for (const record of event.Records) {
      if (record.EventSource !== 'aws:sns' || typeof record.Sns?.Message !== 'string') throw new Error('INVALID_SNS_EVENT');
      if (process.env.SHIPPING_TOPIC_ARN && record.Sns.TopicArn !== process.env.SHIPPING_TOPIC_ARN) throw new Error('UNEXPECTED_TOPIC');
      let message;
      try { message = JSON.parse(record.Sns.Message); } catch { throw new Error('INVALID_EVENT_JSON'); }
      if (!message || typeof message !== 'object') throw new Error('INVALID_SHIPMENT_EVENT');
      if (message.source !== 'adventure-beyond.orders' || message['detail-type'] !== 'ShipmentRequested'
          || message.detail?.schemaVersion !== 1 || !message.detail?.requestId) throw new Error('INVALID_SHIPMENT_EVENT');
      results.push(await repository.save(readShipment(message.detail)));
    }
    return { processed: results.length };
  };
}
const apiHandler = lambdaAdapter(createShippingRoute());
const eventHandler = createShippingEventHandler();
export const handler = (event, context) => Array.isArray(event?.Records) ? eventHandler(event, context) : apiHandler(event, context);
