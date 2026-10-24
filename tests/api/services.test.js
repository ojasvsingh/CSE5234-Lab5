import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServiceServer } from '../../services/shared/http.js';
import { createInventoryRoute } from '../../services/inventory/handler.js';
import { createOrderRoute } from '../../services/orders/handler.js';
import { lambdaAdapter } from '../../services/shared/lambda.js';
import { json } from '../../services/shared/responses.js';

const inventoryPath = '/inventory-management/inventory';
const orderPath = '/order-processing/order';
const validOrder = () => ({
  items: [{ productId: 'ridge-daypack', quantity: 2 }, { productId: 'camp-bottle', quantity: 1 }],
  payment: { cardHolderName: 'Alex Taylor', cardNumber: '4242 4242 4242 4242', expirationDate: '12/35', cvvCode: '123' },
  shipping: { name: 'Alex Taylor', addressLine1: '123 Trailhead Lane', city: 'Columbus', state: 'OH', zip: '43210' },
});
async function start(route) {
  const server = createServiceServer(route);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }) };
}
async function read(url, options) {
  const response = await fetch(url, options);
  return { status: response.status, headers: response.headers, data: response.status === 204 ? null : await response.json() };
}
const post = (url, body) => read(url + orderPath, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
let inventory;
let orders;
let inventoryCalls = 0;
before(async () => {
  const route = createInventoryRoute();
  inventory = await start(request => { inventoryCalls += 1; return route(request); });
  orders = await start(createOrderRoute({ inventoryUrl: inventory.url }));
});
after(async () => { await orders.close(); await inventory.close(); });

test('inventory lists JSON records, looks up IDs, and filters names and combined criteria', async () => {
  const all = await read(inventory.url + inventoryPath);
  assert.equal(all.status, 200);
  assert.equal(all.data.items.length, 5);
  assert.equal(all.data.items[0].availableQuantity, 12);
  const one = await read(inventory.url + inventoryPath + '/items/ridge-daypack');
  assert.equal(one.data.item.name, 'Ridge 28L Daypack');
  const named = await read(inventory.url + inventoryPath + '/items?name=INSULATED%20bottle');
  assert.equal(named.data.items[0].id, 'camp-bottle');
  const combined = await read(inventory.url + inventoryPath + '/items?id=camp-bottle&name=Tent');
  assert.deepEqual(combined.data.items, []);
  assert.equal((await read(inventory.url + inventoryPath + '/items/missing')).status, 404);
});

test('APIs expose JSON errors, method restrictions, and CORS preflight', async () => {
  assert.equal((await read(inventory.url + '/missing')).status, 404);
  assert.equal((await read(inventory.url + inventoryPath, { method: 'POST' })).status, 405);
  assert.equal((await read(orders.url + orderPath)).status, 405);
  const preflight = await read(orders.url + orderPath, { method: 'OPTIONS' });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), '*');
  const wrongType = await read(orders.url + orderPath, { method: 'POST', body: '{}' });
  assert.equal(wrongType.status, 415);
  const invalid = await read(orders.url + orderPath, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.data.error.code, 'INVALID_JSON');
});

test('orders call inventory over HTTP and return authoritative totals and a confirmation', async () => {
  const order = validOrder();
  order.items[0].priceCents = 1;
  order.totalCents = 1;
  const callsBefore = inventoryCalls;
  const result = await post(orders.url, order);
  assert.equal(result.status, 201);
  assert.equal(inventoryCalls, callsBefore + 1);
  assert.match(result.data.confirmationNumber, /^AB-[A-Z0-9]{8}$/);
  assert.equal(result.data.totals.totalCents, 20700);
  assert.equal(result.data.items[0].priceCents, 8900);
  const text = JSON.stringify(result.data);
  for (const privateValue of ['4242', 'cvvCode', 'Trailhead Lane', 'Alex Taylor']) assert.ok(!text.includes(privateValue));
  assert.notEqual((await post(orders.url, order)).data.confirmationNumber, result.data.confirmationNumber);
});

test('exact stock succeeds and excess stock returns 409 with available quantities', async () => {
  const order = validOrder();
  order.items = [{ productId: 'ridge-daypack', quantity: 12 }];
  assert.equal((await post(orders.url, order)).status, 201);
  order.items[0].quantity = 13;
  const result = await post(orders.url, order);
  assert.equal(result.status, 409);
  assert.equal(result.data.confirmationNumber, undefined);
  assert.deepEqual(result.data.error.items, [{ productId: 'ridge-daypack', name: 'Ridge 28L Daypack', requestedQuantity: 13, availableQuantity: 12 }]);
  order.items = [{ productId: 'missing', quantity: 1 }];
  const unknown = await post(orders.url, order);
  assert.equal(unknown.status, 409);
  assert.equal(unknown.data.error.items[0].availableQuantity, 0);
});

test('duplicate lines cannot bypass stock or quantity limits', async () => {
  const order = validOrder();
  order.items = [{ productId: 'ridge-daypack', quantity: 7 }, { productId: 'ridge-daypack', quantity: 7 }];
  const result = await post(orders.url, order);
  assert.equal(result.status, 409);
  assert.equal(result.data.error.items[0].requestedQuantity, 14);
  order.items = [{ productId: 'camp-bottle', quantity: 60 }, { productId: 'camp-bottle', quantity: 60 }];
  assert.equal((await post(orders.url, order)).status, 400);
});

test('invalid quantities and payment/shipping shapes are rejected before inventory is called', async () => {
  const callsBefore = inventoryCalls;
  for (const quantity of [0, -1, 1.5, '2', 100, null]) {
    const order = validOrder();
    order.items[0].quantity = quantity;
    assert.equal((await post(orders.url, order)).status, 400);
  }
  for (const value of [null, [], {}, { items: [] }, { ...validOrder(), payment: null }, { ...validOrder(), shipping: 'no' }]) {
    assert.equal((await post(orders.url, value)).status, 400);
  }
  const wrong = validOrder();
  wrong.payment.cardNumber = 4242424242424242;
  assert.equal((await post(orders.url, wrong)).status, 400);
  const expired = validOrder();
  expired.payment.expirationDate = '01/20';
  expired.shipping.zip = 'invalid';
  const response = await post(orders.url, expired);
  assert.equal(response.status, 400);
  assert.ok(response.data.error.fields.payment.expirationDate);
  assert.ok(response.data.error.fields.shipping.zip);
  assert.equal(inventoryCalls, callsBefore);
});

test('oversized orders receive 413 without reflecting submitted data', async () => {
  const response = await post(orders.url, { padding: 'x'.repeat(70000) });
  assert.equal(response.status, 413);
  assert.equal(response.data.error.code, 'PAYLOAD_TOO_LARGE');
});

test('unavailable, slow, or malformed inventory cannot produce a confirmation', async (t) => {
  const stopped = await start(createInventoryRoute());
  const stoppedUrl = stopped.url;
  await stopped.close();
  const malformed = await start(() => json(200, { items: 'bad data' }));
  const slow = await start(async () => { await new Promise(resolve => setTimeout(resolve, 100)); return json(200, { items: [] }); });
  t.after(async () => { await malformed.close(); await slow.close(); });
  for (const inventoryUrl of [stoppedUrl, malformed.url, slow.url]) {
    const server = await start(createOrderRoute({ inventoryUrl, timeoutMs: 20 }));
    const result = await post(server.url, validOrder());
    assert.equal(result.status, 503);
    assert.equal(result.data.error.code, 'INVENTORY_UNAVAILABLE');
    assert.equal(result.data.confirmationNumber, undefined);
    await server.close();
  }
});

test('Lambda handlers preserve API Gateway query parameters, JSON bodies, and CORS', async () => {
  const inventoryHandler = lambdaAdapter(createInventoryRoute());
  const result = await inventoryHandler({ httpMethod: 'GET', path: inventoryPath + '/items', queryStringParameters: { name: 'tent' } });
  assert.equal(JSON.parse(result.body).items[0].id, 'summit-tent');
  const byId = await inventoryHandler({ httpMethod: 'GET', path: inventoryPath + '/items/camp-bottle', pathParameters: { id: 'camp-bottle' } });
  assert.equal(JSON.parse(byId.body).item.id, 'camp-bottle');
  const orderHandler = lambdaAdapter(createOrderRoute({ inventoryUrl: inventory.url }));
  const success = await orderHandler({ httpMethod: 'POST', path: orderPath, headers: { 'Content-Type': 'application/json' }, body: Buffer.from(JSON.stringify(validOrder())).toString('base64'), isBase64Encoded: true });
  assert.equal(success.statusCode, 201);
  assert.equal(success.headers['Access-Control-Allow-Origin'], '*');
  const order = validOrder();
  order.items[0].quantity = 99;
  const error = await orderHandler({ httpMethod: 'POST', path: orderPath, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(order) });
  assert.equal(error.statusCode, 409);
  assert.equal(error.headers['Access-Control-Allow-Origin'], '*');
});
