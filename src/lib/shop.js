export const MAX_QUANTITY = 99;
export const CART_STORAGE_KEY = 'adventure-beyond.cart.v1';
export const RECEIPT_STORAGE_KEY = 'adventure-beyond.receipt.v2';

export function formatMoney(cents) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

// Saved cart lines contain IDs and quantities only. Prices come from the API.
export function normalizeCart(value, products = null) {
  if (!Array.isArray(value)) return [];
  const allowed = products && new Set(products.map((product) => product.id));
  const quantities = new Map();
  for (const line of value) {
    if (!line || typeof line.productId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(line.productId)) continue;
    if (allowed && !allowed.has(line.productId)) continue;
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) continue;
    quantities.set(line.productId, Math.min(MAX_QUANTITY, (quantities.get(line.productId) || 0) + line.quantity));
  }
  return [...quantities].map(([productId, quantity]) => ({ productId, quantity }));
}

export function getCartItems(cart, products = []) {
  const catalogue = new Map(products.map((product) => [product.id, product]));
  return normalizeCart(cart, products).map((line) => ({
    ...catalogue.get(line.productId), quantity: line.quantity,
    lineTotalCents: catalogue.get(line.productId).priceCents * line.quantity,
  }));
}

export function getTotals(cart, products = []) {
  const items = getCartItems(cart, products);
  const subtotalCents = items.reduce((sum, item) => sum + item.lineTotalCents, 0);
  return { itemCount: items.reduce((sum, item) => sum + item.quantity, 0), subtotalCents, totalCents: subtotalCents };
}

export function changeQuantity(cart, productId, quantity, products = []) {
  if (!products.some((product) => product.id === productId) || !Number.isSafeInteger(quantity)) return cart;
  const current = normalizeCart(cart, products);
  if (quantity <= 0) return current.filter((line) => line.productId !== productId);
  const next = { productId, quantity: Math.min(quantity, MAX_QUANTITY) };
  return current.some((line) => line.productId === productId)
    ? current.map((line) => line.productId === productId ? next : line) : [...current, next];
}

export function readStoredValue(key) {
  try { return JSON.parse(sessionStorage.getItem(key)); } catch { return null; }
}

export function writeStoredValue(key, value) {
  try {
    if (value == null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(value));
  } catch { /* Storage-disabled browsers can still use the in-memory flow. */ }
}

// Keep the server's receipt snapshot, not today's inventory prices or private fields.
export function normalizeReceipt(value) {
  if (!value || typeof value.number !== 'string' || !/^AB-[A-Z0-9]{8}$/.test(value.number)
    || !Array.isArray(value.items) || !value.items.length || value.items.length > 100) return null;
  const items = [];
  const ids = new Set();
  for (const item of value.items) {
    if (!item || typeof item.id !== 'string' || ids.has(item.id) || typeof item.name !== 'string'
      || typeof item.image !== 'string' || !Number.isSafeInteger(item.priceCents) || item.priceCents < 0
      || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_QUANTITY
      || !Number.isSafeInteger(item.lineTotalCents) || item.lineTotalCents !== item.priceCents * item.quantity) return null;
    ids.add(item.id);
    items.push({ id: item.id, name: item.name, image: item.image, priceCents: item.priceCents, quantity: item.quantity, lineTotalCents: item.lineTotalCents });
  }
  const subtotalCents = items.reduce((sum, item) => sum + item.lineTotalCents, 0);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  if (!Number.isSafeInteger(subtotalCents) || value.totals?.subtotalCents !== subtotalCents
    || value.totals?.totalCents !== subtotalCents || value.totals?.itemCount !== itemCount) return null;
  return { number: value.number, items, totals: { itemCount, subtotalCents, totalCents: subtotalCents } };
}
