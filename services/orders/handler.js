import { createOrderRepository } from '../database/orders.js';
import { buildReceipt } from './receipt.js';
import { buildShipmentEvent } from './shipment.js';
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
  return Object.fromEntries(Object.keys(shape).map(key => [key, normalized[key].trim()]));
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
  return { quantities, payment, shipping };
}

function validItem(item) {
  return Boolean(item) && typeof item.id === 'string' && typeof item.name === 'string'
    && Number.isSafeInteger(item.availableQuantity) && item.availableQuantity >= 0
    && Number.isSafeInteger(item.priceCents) && item.priceCents >= 0 && Number.isSafeInteger(item.priceCents * 99);
}

async function loadItems(ids, { inventoryUrl, timeoutMs, fetchInventory }) {
  const catalogue = new Map();
  const base = inventoryUrl.replace(/\/$/, '');
  for (const id of ids) {
    let response;
    try {
      // One inventory call per line item. Never import the inventory catalogue.
      response = await fetchInventory(`${base}/inventory-management/inventory/items/${encodeURIComponent(id)}`, {
        headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new HttpError(503, 'INVENTORY_UNAVAILABLE', 'We could not check stock. Your order was not confirmed. Please try again.');
    }
    if (response.status === 404) continue;
    if (!response.ok) throw new HttpError(503, 'INVENTORY_UNAVAILABLE', 'We could not check stock. Your order was not confirmed. Please try again.');
    let data;
    try { data = await response.json(); } catch {
      throw new HttpError(503, 'INVENTORY_UNAVAILABLE', 'We could not check stock. Your order was not confirmed. Please try again.');
    }
    if (!validItem(data?.item) || data.item.id !== id) {
      throw new HttpError(503, 'INVENTORY_UNAVAILABLE', 'We could not check stock. Your order was not confirmed. Please try again.');
    }
    catalogue.set(id, data.item);
  }
  return catalogue;
}

async function requestPayment(payment, { paymentUrl, timeoutMs, fetchPayment }) {
  let response;
  try {
    response = await fetchPayment(`${paymentUrl.replace(/\/$/, '')}/payment`, {
      method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(payment), signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new HttpError(503, 'PAYMENT_UNAVAILABLE', 'We could not process payment. Your order was not confirmed. Please try again.');
  }
  if (!response.ok) throw new HttpError(503, 'PAYMENT_UNAVAILABLE', 'We could not process payment. Your order was not confirmed. Please try again.');
  let data;
  try { data = await response.json(); } catch {
    throw new HttpError(503, 'PAYMENT_UNAVAILABLE', 'We could not process payment. Your order was not confirmed. Please try again.');
  }
  if (!data || typeof data.confirmationToken !== 'string' || !/^PAY-[A-F0-9]{8}$/.test(data.confirmationToken)) {
    throw new HttpError(503, 'PAYMENT_UNAVAILABLE', 'We could not process payment. Your order was not confirmed. Please try again.');
  }
  return data.confirmationToken;
}

export function createOrderRoute({
  inventoryUrl = process.env.INVENTORY_SERVICE_URL || 'http://127.0.0.1:3001',
  paymentUrl = process.env.PAYMENT_SERVICE_URL || 'http://127.0.0.1:3003',
  businessId = process.env.STORE_BUSINESS_ID || 'AB-STORE-1001',
  timeoutMs = 5000,
  fetchInventory = fetch,
  fetchPayment = fetch,
  repository = createOrderRepository(),
  publishShipment = async () => {},
} = {}) {
  return async (request) => {
    if (request.path === '/health' && request.method === 'GET') return json(200, { service: 'order-processing', status: 'ok' });
    if (request.path !== '/order-processing/order') throw new HttpError(404, 'NOT_FOUND', 'This order endpoint does not exist.');
    if (request.method !== 'POST') return json(405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST to submit an order.' } }, { Allow: 'POST, OPTIONS' });
    const order = validateOrder(parseJson(request));
    const catalogue = await loadItems(order.quantities.keys(), { inventoryUrl, timeoutMs, fetchInventory });
    buildReceipt(order.quantities, catalogue);
    await repository.ensureAvailable(order.quantities);
    const paymentToken = await requestPayment(order.payment, { paymentUrl, timeoutMs, fetchPayment });
    const saved = await repository.save({ quantities: order.quantities, shipping: order.shipping, paymentToken });
    // EventBridge publishes this later. Do not call the shipping service directly.
    await publishShipment(buildShipmentEvent({ shipping: order.shipping, receipt: saved, businessId }));
    return json(201, saved);
  };
}

export const handler = lambdaAdapter(createOrderRoute());
