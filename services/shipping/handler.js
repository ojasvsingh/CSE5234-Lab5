import { createShippingRepository } from '../database/shipments.js';
import { HttpError, json, parseJson } from '../shared/responses.js';
import { emptyShipping, validateShipping } from '../shared/validation.js';
import { lambdaAdapter } from '../shared/lambda.js';

function readShipment(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'INVALID_SHIPMENT', 'A shipment must be an object.');
  if (typeof body.businessId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/.test(body.businessId)) {
    throw new HttpError(400, 'INVALID_SHIPMENT', 'businessId must be 1–64 letters, digits, or hyphens.');
  }
  if (!Number.isSafeInteger(body.packetCount) || body.packetCount < 1 || body.packetCount > 100) {
    throw new HttpError(400, 'INVALID_SHIPMENT', 'packetCount must be a whole number from 1 to 100.');
  }
  if (typeof body.weightPounds !== 'number' || !Number.isFinite(body.weightPounds) || body.weightPounds <= 0 || body.weightPounds > 1000 || Math.round(body.weightPounds * 100) !== body.weightPounds * 100) {
    throw new HttpError(400, 'INVALID_SHIPMENT', 'weightPounds must be the weight of each packet, up to two decimal places.');
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
  return { businessId: body.businessId, packetCount: body.packetCount, weightPounds: body.weightPounds, address };
}

export function createShippingRoute(repository = createShippingRepository()) {
  return async (request) => {
    if (request.path === '/health' && request.method === 'GET') return json(200, { service: 'shipping-processing', status: 'ok' });
    if (request.path !== '/shipping') throw new HttpError(404, 'NOT_FOUND', 'This shipping endpoint does not exist.');
    if (request.method !== 'POST') return json(405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST to start a shipment.' } }, { Allow: 'POST, OPTIONS' });
    return json(201, await repository.save(readShipment(parseJson(request))));
  };
}

export const handler = lambdaAdapter(createShippingRoute());
