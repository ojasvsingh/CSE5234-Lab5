import { HttpError } from '../shared/responses.js';

export function buildReceipt(quantities, catalogue) {
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
  return { items, totals: { itemCount: items.reduce((sum, item) => sum + item.quantity, 0), subtotalCents, totalCents: subtotalCents } };
}
