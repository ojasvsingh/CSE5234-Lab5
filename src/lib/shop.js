import { productById } from '../data/products.js';

export const MAX_QUANTITY = 99;
export const CART_STORAGE_KEY = 'adventure-beyond.cart.v1';
export const RECEIPT_STORAGE_KEY = 'adventure-beyond.receipt.v1';

export function formatMoney(cents) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

// Rebuild cart lines from known products; browser storage is never a price authority.
export function normalizeCart(value) {
  if (!Array.isArray(value)) return [];
  const quantities = new Map();
  for (const line of value) {
    if (!line || !Object.hasOwn(productById, line.productId)) continue;
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) continue;
    quantities.set(
      line.productId,
      Math.min(MAX_QUANTITY, (quantities.get(line.productId) || 0) + line.quantity),
    );
  }
  return [...quantities].map(([productId, quantity]) => ({ productId, quantity }));
}

export function getCartItems(cart) {
  return normalizeCart(cart).map((line) => ({
    ...productById[line.productId],
    quantity: line.quantity,
    lineTotalCents: productById[line.productId].priceCents * line.quantity,
  }));
}

export function getTotals(cart) {
  const items = getCartItems(cart);
  const subtotalCents = items.reduce((sum, item) => sum + item.lineTotalCents, 0);
  return {
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotalCents,
    totalCents: subtotalCents,
  };
}

export function changeQuantity(cart, productId, quantity) {
  if (!Object.hasOwn(productById, productId) || !Number.isSafeInteger(quantity)) return cart;
  const current = normalizeCart(cart);
  if (quantity <= 0) return current.filter((line) => line.productId !== productId);
  const next = { productId, quantity: Math.min(quantity, MAX_QUANTITY) };
  return current.some((line) => line.productId === productId)
    ? current.map((line) => line.productId === productId ? next : line)
    : [...current, next];
}

export function readStoredValue(key) {
  try {
    return JSON.parse(sessionStorage.getItem(key));
  } catch {
    return null;
  }
}

export function writeStoredValue(key, value) {
  try {
    if (value == null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Browsing with storage disabled still supports the complete in-memory flow.
  }
}

export function normalizeReceipt(value) {
  if (!value || typeof value.number !== 'string' || !/^AB-[A-Z0-9]{8}$/.test(value.number)) return null;
  const cart = normalizeCart(value.cart);
  return cart.length ? { number: value.number, cart } : null;
}
