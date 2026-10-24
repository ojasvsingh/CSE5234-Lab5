export class ApiError extends Error {
  constructor(message, status = 0, details = {}) {
    super(message);
    this.status = status;
    this.code = details.code;
    this.items = details.items || [];
    this.fields = details.fields;
  }
}

async function request(baseUrl, path, options = {}) {
  let response;
  try {
    response = await fetch(`${(baseUrl || '').replace(/\/$/, '')}${path}`, {
      ...options, headers: { Accept: 'application/json', ...options.headers }, signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new ApiError('We could not reach the service. Please try again.');
  }
  let data;
  try { data = await response.json(); } catch { throw new ApiError('The service returned an unreadable response. Please try again.', response.status); }
  if (!response.ok) throw new ApiError(data.error?.message || 'The request failed. Please try again.', response.status, data.error);
  return data;
}

export async function loadInventory() {
  const data = await request(import.meta.env.VITE_INVENTORY_API_URL, '/inventory-management/inventory');
  const ids = new Set();
  if (!Array.isArray(data.items) || data.items.some((item) => {
    if (!item || ids.has(item.id)) return true;
    ids.add(item.id);
    return ['id', 'name', 'category', 'description', 'image', 'color', 'tag'].some((key) => typeof item[key] !== 'string')
      || !Number.isSafeInteger(item.priceCents) || item.priceCents < 0
      || !Number.isSafeInteger(item.availableQuantity) || item.availableQuantity < 0;
  })) throw new ApiError('The inventory response is incomplete. Please try again.');
  return data.items;
}

export function postOrder(order) {
  return request(import.meta.env.VITE_ORDER_API_URL, '/order-processing/order', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(order),
  });
}
