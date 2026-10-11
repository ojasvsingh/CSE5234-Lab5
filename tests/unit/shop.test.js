import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeCart, normalizeReceipt, changeQuantity, getTotals, getCartItems, formatMoney,
} from '../../src/lib/shop.js';
import {
  emptyPayment, emptyShipping, validatePayment, validateShipping, cardLastFour,
} from '../../src/lib/validation.js';

test('catalog totals use integer cents and ignore prices injected through saved cart data', () => {
  const cart = [
    { productId: 'ridge-daypack', quantity: 2, priceCents: 1 },
    { productId: 'camp-bottle', quantity: 3 },
  ];
  assert.deepEqual(getTotals(cart), { itemCount: 5, subtotalCents: 26500, totalCents: 26500 });
  assert.equal(getCartItems(cart)[0].lineTotalCents, 17800);
  assert.equal(formatMoney(26500), '$265.00');
  assert.equal(getTotals([]).totalCents, 0);
});

test('malformed storage, unknown products, invalid quantities, and duplicate lines are normalized', () => {
  assert.deepEqual(normalizeCart({ cart: 'bad data' }), []);
  assert.deepEqual(normalizeCart(null), []);
  assert.deepEqual(normalizeCart([
    null,
    { productId: '__proto__', quantity: 1 },
    { productId: 'unknown', quantity: 2 },
    { productId: 'ridge-daypack', quantity: -1 },
    { productId: 'ridge-daypack', quantity: 1.5 },
    { productId: 'summit-tent', quantity: '2' },
    { productId: 'camp-bottle', quantity: 90 },
    { productId: 'camp-bottle', quantity: 20 },
  ]), [{ productId: 'camp-bottle', quantity: 99 }]);
});

test('quantity changes retain line order, cap at 99, and remove only the requested product', () => {
  const cart = [{ productId: 'ridge-daypack', quantity: 1 }, { productId: 'camp-bottle', quantity: 2 }];
  assert.deepEqual(changeQuantity(cart, 'ridge-daypack', 100), [
    { productId: 'ridge-daypack', quantity: 99 }, { productId: 'camp-bottle', quantity: 2 },
  ]);
  assert.deepEqual(changeQuantity(cart, 'ridge-daypack', 0), [{ productId: 'camp-bottle', quantity: 2 }]);
  assert.deepEqual(changeQuantity(cart, 'ridge-daypack', 2.5), cart);
  assert.deepEqual(changeQuantity(cart, 'no-product', 2), cart);
});

test('only a valid nonempty receipt can restore a confirmation page', () => {
  assert.equal(normalizeReceipt({ number: 'fake', cart: [] }), null);
  assert.equal(normalizeReceipt({ number: 'AB-12345678', cart: [] }), null);
  assert.deepEqual(normalizeReceipt({
    number: 'AB-12345678', cart: [{ productId: 'camp-bottle', quantity: 2 }], cardNumber: 'discard',
  }), { number: 'AB-12345678', cart: [{ productId: 'camp-bottle', quantity: 2 }] });
});

const validPayment = {
  cardHolderName: 'Alex Taylor', cardNumber: '4242 4242 4242 4242',
  expirationDate: '10/26', cvvCode: '123',
};
const october2026 = new Date(2026, 9, 7);

test('payment validation accepts the current expiration month, formatted cards, and 3–4 digit CVVs', () => {
  assert.deepEqual(validatePayment(validPayment, october2026), {});
  assert.deepEqual(validatePayment({ ...validPayment, cardNumber: '378282246310005', cvvCode: '1234' }, october2026), {});
  assert.equal(cardLastFour(validPayment), '4242');
});

test('payment validation rejects missing fields, expired dates, impossible months, and invalid card characters', () => {
  assert.equal(Object.keys(validatePayment(emptyPayment, october2026)).length, 4);
  for (const expirationDate of ['09/26', '12/25', '00/30', '13/30', '1/30', '12/2030']) {
    assert.ok(validatePayment({ ...validPayment, expirationDate }, october2026).expirationDate);
  }
  assert.ok(validatePayment({ ...validPayment, cardNumber: '4242x4242x4242x4242' }, october2026).cardNumber);
  assert.ok(validatePayment({ ...validPayment, cardNumber: '123' }, october2026).cardNumber);
  assert.ok(validatePayment({ ...validPayment, cvvCode: '12a' }, october2026).cvvCode);
  assert.ok(validatePayment({ ...validPayment, cardHolderName: '   ' }, october2026).cardHolderName);
});

test('US shipping requires an address, valid state, and ZIP while apartment is optional', () => {
  const shipping = { name: 'Alex Taylor', addressLine1: '123 Trailhead Lane', addressLine2: '', city: 'Columbus', state: 'OH', zip: '43210' };
  assert.deepEqual(validateShipping(shipping), {});
  assert.deepEqual(validateShipping({ ...shipping, zip: '43210-1234' }), {});
  assert.equal(Object.keys(validateShipping(emptyShipping)).length, 5);
  assert.ok(validateShipping({ ...shipping, state: 'NOT-A-STATE' }).state);
  assert.ok(validateShipping({ ...shipping, zip: 'abcde' }).zip);
  assert.ok(validateShipping({ ...shipping, city: '  ' }).city);
});
