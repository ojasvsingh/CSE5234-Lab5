import { randomUUID } from 'node:crypto';
import { HttpError, json, parseJson } from '../shared/responses.js';
import { emptyPayment, emptyShipping, validatePayment, validateShipping } from '../shared/validation.js';
import { lambdaAdapter } from '../shared/lambda.js';

function validateFields(value, shape, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'INVALID_ORDER', `${label} must be an object.`);
  const normalized = { ...shape, ...value };
  for (const key of Object.keys(shape)) {
    if (typeof normalized[key] !== 'string' || normalized[key].length > 200) {
      throw new HttpError(400, 'INVALID_ORDER', `${label}.${key} must be a string of at most 200 characters.`);
    }
  }
  return normalized;
}

function validateOrder(order) {
  if (!order || typeof order !== 'object' || !Array.isArray(order.items) || !order.items.length || order.items.length > 100) {
    throw new HttpError(400, 'INVALID_ORDER', 'An order must contain between 1 and 100 item lines.');
  }
  const quantities = new Map();
  for (const line of order.items) {
    if (!line || typeof line.productId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(line.productId)
      || !Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 99) {
      throw new HttpError(400, 'INVALID_ORDER', 'Each item needs a productId and a whole-number quantity from 1 to 99.');
    }
    const total = (quantities.get(line.productId) || 0) + line.quantity;
    if (total > 99) throw new HttpError(400, 'INVALID_ORDER', 'The combined quantity for one item cannot exceed 99.');
    quantities.set(line.productId, total);
  }
  const payment = validateFields(order.payment, emptyPayment, 'payment');
  const shipping = validateFields(order.shipping, emptyShipping, 'shipping');
  const fields = { payment: validatePayment(payment), shipping: validateShipping(shipping) };
  if (Object.keys(fields.payment).length || Object.keys(fields.shipping).length) {
    throw new HttpError(400, 'INVALID_ORDER', 'Check the payment and shipping details.', { fields });
  }
  return quantities;
}

export function createOrderRoute({
  inventoryUrl = process.env.INVENTORY_SERVICE_URL || 'http://127.0.0.1:3001',
  timeoutMs = 5000,
  fetchInventory = fetch,
} = {}) {
  return async (request) => {
    if (request.path === '/health' && request.method === 'GET') return json(200, { service: 'order-processing', status: 'ok' });
    if (request.path !== '/order-processing/order') throw new HttpError(404, 'NOT_FOUND', 'This order endpoint does not exist.');
    if (request.method !== 'POST') return json(405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST to submit an order.' } }, { Allow: 'POST, OPTIONS' });
    const quantities = validateOrder(parseJson(request));
    let catalogue;
    try {
      // Call the other service over HTTP; never import its catalogue.
      const response = await fetchInventory(`${inventoryUrl.replace(/\/$/, '')}/inventory-management/inventory`, {
        headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error('Inventory request failed');
      const data = await response.json();
      if (!Array.isArray(data.items) || data.items.some((item) => !item || typeof item.id !== 'string'
        || typeof item.name !== 'string' || !Number.isSafeInteger(item.availableQuantity) || item.availableQuantity < 0
        || !Number.isSafeInteger(item.priceCents) || item.priceCents < 0 || !Number.isSafeInteger(item.priceCents * 99))) {
        throw new Error('Invalid inventory response');
      }
      catalogue = new Map(data.items.map((item) => [item.id, item]));
    } catch {
      throw new HttpError(503, 'INVENTORY_UNAVAILABLE', 'We could not check stock. Your order was not confirmed. Please try again.');
    }
    const unavailable = [];
    for (const [productId, quantity] of quantities) {
      const item = catalogue.get(productId);
      if (!item || quantity > item.availableQuantity) {
        unavailable.push({ productId, name: item?.name || productId, requestedQuantity: quantity, availableQuantity: item?.availableQuantity || 0 });
      }
    }
    if (unavailable.length) throw new HttpError(409, 'INSUFFICIENT_STOCK', 'Some items do not have enough stock. Adjust your bag and try again.', { items: unavailable });
    const items = [...quantities].map(([id, quantity]) => {
      const item = catalogue.get(id);
      return { id, name: item.name, image: item.image, color: item.color, priceCents: item.priceCents, quantity, lineTotalCents: item.priceCents * quantity };
    });
    const subtotalCents = items.reduce((sum, item) => sum + item.lineTotalCents, 0);
    if (!Number.isSafeInteger(subtotalCents)) throw new HttpError(400, 'INVALID_ORDER', 'The order total is too large.');
    return json(201, {
      confirmationNumber: `AB-${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`,
      items,
      totals: { itemCount: items.reduce((sum, item) => sum + item.quantity, 0), subtotalCents, totalCents: subtotalCents },
    });
  };
}

export const handler = lambdaAdapter(createOrderRoute());
