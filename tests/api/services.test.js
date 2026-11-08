import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServiceServer } from '../../services/shared/http.js';
import { createInventoryRoute } from '../../services/inventory/handler.js';
import { createOrderRoute } from '../../services/orders/handler.js';
import { createPaymentRoute } from '../../services/payment/handler.js';
import { createShippingRoute, createShippingEventHandler } from '../../services/shipping/handler.js';
import { createOutboxDispatcher } from '../../services/database/outbox.js';
import { eventEnvelope } from '../../services/events/publisher.js';
import { lambdaAdapter } from '../../services/shared/lambda.js';
import { json } from '../../services/shared/responses.js';
import { createItemRepository } from '../../services/database/items.js';
import { createOrderRepository } from '../../services/database/orders.js';
import { createPaymentRepository } from '../../services/database/payments.js';
import { createShippingRepository } from '../../services/database/shipments.js';
import { createDatabasePool } from '../../services/database/pool.js';
import { createTestPool, prepareTestDatabase, testDatabaseEnv, testPaymentEnv, testShippingEnv } from '../fixtures/database.js';
import { initializeDatabase } from '../../scripts/database.mjs';

const inventoryPath = '/inventory-management/inventory';
const orderPath = '/order-processing/order';
const validOrder = () => ({
  items: [{ productId: 'ridge-daypack', quantity: 2 }, { productId: 'camp-bottle', quantity: 1 }],
  payment: { cardHolderName: 'Alex Taylor', cardNumber: '4242 4242 4242 4242', expirationDate: '12/35', cvvCode: '123' },
  shipping: { name: 'Alex Taylor', email: 'alex@example.com', country: 'US', addressLine1: '123 Trailhead Lane', city: 'Columbus', state: 'OH', zip: '43210' },
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
let payments;
let inventoryCalls = 0;
const pool = createTestPool();
const paymentPool = createDatabasePool(testPaymentEnv);
const shippingPool = createDatabasePool(testShippingEnv);
const itemRepository = createItemRepository(() => pool);
const orderRepository = createOrderRepository(() => pool);
const paymentRepository = createPaymentRepository(() => paymentPool);
const shippingRepository = createShippingRepository(() => shippingPool);
before(async () => {
  await prepareTestDatabase();
  const route = createInventoryRoute(itemRepository);
  inventory = await start(request => { inventoryCalls += 1; return route(request); });
  payments = await start(createPaymentRoute(paymentRepository));
  orders = await start(createOrderRoute({
    inventoryUrl: inventory.url, paymentUrl: payments.url, repository: orderRepository,
  }));
});
after(async () => { await orders?.close(); await payments?.close(); await inventory?.close(); await pool.end(); await paymentPool.end(); await shippingPool.end(); });

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
  assert.equal(inventoryCalls, callsBefore + 2);
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
  const stopped = await start(createInventoryRoute(itemRepository));
  const stoppedUrl = stopped.url;
  await stopped.close();
  const malformed = await start(() => json(200, { items: 'bad data' }));
  const slow = await start(async () => { await new Promise(resolve => setTimeout(resolve, 100)); return json(200, { items: [] }); });
  t.after(async () => { await malformed.close(); await slow.close(); });
  for (const inventoryUrl of [stoppedUrl, malformed.url, slow.url]) {
    const server = await start(createOrderRoute({ inventoryUrl, timeoutMs: 20, repository: orderRepository }));
    const result = await post(server.url, validOrder());
    assert.equal(result.status, 503);
    assert.equal(result.data.error.code, 'INVENTORY_UNAVAILABLE');
    assert.equal(result.data.confirmationNumber, undefined);
    await server.close();
  }
});

test('Lambda handlers preserve API Gateway query parameters, JSON bodies, and CORS', async () => {
  const inventoryHandler = lambdaAdapter(createInventoryRoute(itemRepository));
  const context = { callbackWaitsForEmptyEventLoop: true };
  const result = await inventoryHandler({ httpMethod: 'GET', path: inventoryPath + '/items', queryStringParameters: { name: 'tent' } }, context);
  assert.equal(context.callbackWaitsForEmptyEventLoop, false);
  assert.equal(JSON.parse(result.body).items[0].id, 'summit-tent');
  const byId = await inventoryHandler({ httpMethod: 'GET', path: inventoryPath + '/items/camp-bottle', pathParameters: { id: 'camp-bottle' } });
  assert.equal(JSON.parse(byId.body).item.id, 'camp-bottle');
  const orderHandler = lambdaAdapter(createOrderRoute({ inventoryUrl: inventory.url, paymentUrl: payments.url, repository: orderRepository }));
  const success = await orderHandler({ httpMethod: 'POST', path: orderPath, headers: { 'Content-Type': 'application/json' }, body: Buffer.from(JSON.stringify(validOrder())).toString('base64'), isBase64Encoded: true });
  assert.equal(success.statusCode, 201);
  assert.equal(success.headers['Access-Control-Allow-Origin'], '*');
  const order = validOrder();
  order.items[0].quantity = 99;
  const error = await orderHandler({ httpMethod: 'POST', path: orderPath, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(order) });
  assert.equal(error.statusCode, 409);
  assert.equal(error.headers['Access-Control-Allow-Origin'], '*');
});

test('SQL edits and a newly inserted product reach the live API without a restart', async () => {
  try {
    await pool.execute("UPDATE ITEM SET NAME = ?, UNIT_PRICE = ?, AVAILABLE_QUANTITY = ? WHERE SLUG = ?", ['Changed bottle', '31.29', 3, 'camp-bottle']);
    const result = await read(inventory.url + inventoryPath + '/items/camp-bottle');
    assert.equal(result.data.item.name, 'Changed bottle');
    assert.equal(result.data.item.priceCents, 3129);
    assert.equal(result.data.item.availableQuantity, 3);
    await initializeDatabase(pool);
    assert.equal((await read(inventory.url + inventoryPath + '/items/camp-bottle')).data.item.priceCents, 3129, 'rerunning setup must preserve edits');
    await pool.execute(`INSERT INTO ITEM (ITEM_NUMBER, SLUG, NAME, DESCRIPTION, AVAILABLE_QUANTITY, UNIT_PRICE, CATEGORY, IMAGE, COLOR, TAG)
      VALUES (9001, 'sql-test-item', '100%_Test gear', 'Added directly to MySQL', 4, 0.29, 'Tests', '/images/bottle.svg', 'Blue', 'TEST')`);
    const added = await read(inventory.url + inventoryPath + '/items?name=100%25_Test');
    assert.equal(added.data.items.length, 1);
    assert.equal(added.data.items[0].id, 'sql-test-item');
    assert.equal(added.data.items[0].priceCents, 29);
    const injection = await read(inventory.url + inventoryPath + '/items?name=' + encodeURIComponent("' OR 1=1 --"));
    assert.deepEqual(injection.data.items, []);
    assert.equal((await read(inventory.url + inventoryPath)).data.items.length, 6);
  } finally {
    await pool.execute("UPDATE ITEM SET NAME = 'Camp Insulated Bottle', UNIT_PRICE = 29.00, AVAILABLE_QUANTITY = 30 WHERE SLUG = 'camp-bottle'");
    await pool.execute("DELETE FROM ITEM WHERE SLUG = 'sql-test-item'");
  }
});

test('orders persist linked rows, exact prices, requested quantities, and default New status', async () => {
  const order = validOrder();
  order.shipping.name = "Alex O'Taylor";
  const result = await post(orders.url, order);
  assert.equal(result.status, 201);
  assert.equal(result.data.status, 'New');
  assert.equal(result.data.confirmationNumber, `AB-${result.data.orderId.toString(16).toUpperCase().padStart(8, '0')}`);
  // A fresh connection represents a new process; no in-memory receipt is involved.
  const freshPool = createTestPool();
  try {
    const [[saved]] = await freshPool.execute(`SELECT o.*, s.ADDRESS1, s.COUNTRY, s.EMAIL
      FROM CUSTOMER_ORDER o JOIN SHIPPING_INFO s ON s.ID = o.SHIPPING_INFO_ID_FK
      WHERE o.ID = ?`, [result.data.orderId]);
    assert.equal(saved.STATUS, 'New');
    assert.equal(saved.CUSTOMER_NAME, "Alex O'Taylor");
    assert.equal(saved.CUSTOMER_EMAIL, 'alex@example.com');
    assert.equal(saved.EMAIL, saved.CUSTOMER_EMAIL);
    assert.equal(saved.COUNTRY, 'US');
    assert.equal(saved.ADDRESS1, '123 Trailhead Lane');
    assert.equal(saved.PAYMENT_INFO_ID_FK, null);
    assert.match(saved.PAYMENT_CONFIRMATION_TOKEN, /^PAY-[A-F0-9]{32}$/);
    const [[payment]] = await paymentPool.execute('SELECT HOLDER_NAME, CARD_NUM, CVV FROM PAYMENT_INFO WHERE CONFIRMATION_TOKEN = ?', [saved.PAYMENT_CONFIRMATION_TOKEN]);
    assert.equal(payment.HOLDER_NAME, 'Alex Taylor');
    assert.equal(payment.CARD_NUM, '****4242');
    assert.equal(payment.CVV, null);
    const [[outbox]] = await freshPool.execute('SELECT DETAIL, PUBLISHED_AT FROM SHIPMENT_OUTBOX WHERE ORDER_ID = ?', [saved.ID]);
    const shipment = typeof outbox.DETAIL === 'string' ? JSON.parse(outbox.DETAIL) : outbox.DETAIL;
    assert.equal(outbox.PUBLISHED_AT, null, 'checkout commits before asynchronous delivery');
    assert.equal(shipment.businessId, 'AB-STORE-1001');
    assert.equal(shipment.packetCount, 2);
    assert.deepEqual(shipment.packetWeightsPounds, [2, 1]);
    assert.equal(shipment.address.name, "Alex O'Taylor");
    for (const forbidden of ['cardNumber', 'cvvCode', 'confirmationToken', '4242']) {
      assert.ok(!JSON.stringify(shipment).includes(forbidden));
    }
    const [lines] = await freshPool.execute('SELECT * FROM CUSTOMER_ORDER_LINE_ITEM WHERE CUSTOMER_ORDER_ID_FK = ? ORDER BY ID', [saved.ID]);
    assert.equal(lines.length, 2);
    assert.equal(lines[0].QUANTITY, 2, 'requested quantity must not become warehouse quantity');
    assert.equal(lines[0].UNIT_PRICE, '89.00');
    assert.equal(lines[0].ITEM_NUMBER, 1001);
    assert.equal(lines[0].ITEM_NAME, 'Ridge 28L Daypack');
    await pool.execute("UPDATE ITEM SET NAME = 'Renamed pack', UNIT_PRICE = 99.00 WHERE SLUG = 'ridge-daypack'");
    const [[snapshot]] = await freshPool.execute('SELECT ITEM_NAME, UNIT_PRICE FROM CUSTOMER_ORDER_LINE_ITEM WHERE ID = ?', [lines[0].ID]);
    assert.equal(snapshot.ITEM_NAME, 'Ridge 28L Daypack');
    assert.equal(snapshot.UNIT_PRICE, '89.00', 'saved order prices must not change with inventory');
  } finally {
    await freshPool.end();
    await pool.execute("UPDATE ITEM SET NAME = 'Ridge 28L Daypack', UNIT_PRICE = 89.00 WHERE SLUG = 'ridge-daypack'");
  }
});

async function orderRowCounts() {
  const tables = ['CUSTOMER_ORDER', 'CUSTOMER_ORDER_LINE_ITEM', 'SHIPPING_INFO', 'PAYMENT_INFO', 'SHIPMENT_OUTBOX'];
  return Promise.all(tables.map(async table => (await pool.query(`SELECT COUNT(*) AS n FROM ${table}`))[0][0].n));
}

test('a failed line insert rolls back the order, shipping, and earlier lines', async () => {
  const counts = await orderRowCounts();
  const [[{ n: paymentsBefore }]] = await paymentPool.query('SELECT COUNT(*) AS n FROM PAYMENT_INFO');
  let insertedLines = 0;
  const failingRepository = createOrderRepository(() => ({
    async getConnection() {
      const connection = await pool.getConnection();
      return {
        beginTransaction: () => connection.beginTransaction(),
        commit: () => connection.commit(),
        rollback: () => connection.rollback(),
        release: () => connection.release(),
        destroy: () => connection.destroy(),
        execute: (options, values) => {
          if (options.sql.startsWith('INSERT INTO CUSTOMER_ORDER_LINE_ITEM') && ++insertedLines === 2) {
            throw new Error('Simulated database failure with private SQL details');
          }
          return connection.execute(options, values);
        },
      };
    },
  }));
  const server = await start(createOrderRoute({ inventoryUrl: inventory.url, paymentUrl: payments.url, repository: failingRepository }));
  try {
    const result = await post(server.url, validOrder());
    assert.equal(result.status, 503);
    assert.equal(result.data.error.code, 'DATABASE_UNAVAILABLE');
    assert.equal(insertedLines, 2);
    assert.equal(result.data.confirmationNumber, undefined);
    assert.ok(!JSON.stringify(result.data).includes('private SQL'));
    assert.deepEqual(await orderRowCounts(), counts);
    const [[{ n: paymentsAfter }]] = await paymentPool.query('SELECT COUNT(*) AS n FROM PAYMENT_INFO');
    assert.equal(paymentsAfter, paymentsBefore + 1);
  } finally {
    await server.close();
  }
});

test('shortage, invalid email, and unsupported country do not create partial orders', async () => {
  const counts = await orderRowCounts();
  const [[{ n: paymentsBefore }]] = await paymentPool.query('SELECT COUNT(*) AS n FROM PAYMENT_INFO');
  const short = validOrder();
  short.items[0].quantity = 99;
  assert.equal((await post(orders.url, short)).status, 409);
  for (const email of ['', 'bad-email', 'a b@example.com', 'x'.repeat(201)]) {
    const order = validOrder();
    order.shipping.email = email;
    assert.equal((await post(orders.url, order)).status, 400);
  }
  const order = validOrder();
  order.shipping.country = 'CA';
  assert.equal((await post(orders.url, order)).status, 400);
  assert.deepEqual(await orderRowCounts(), counts);
  assert.equal((await paymentPool.query('SELECT COUNT(*) AS n FROM PAYMENT_INFO'))[0][0].n, paymentsBefore);
});

test('database failures give 503 without exposing credentials or falling back to sample products', async () => {
  const badPool = createDatabasePool({ ...testDatabaseEnv, DB_PASSWORD: 'PRIVATE-WRONG-PASSWORD' });
  const badInventory = await start(createInventoryRoute(createItemRepository(() => badPool)));
  const badOrders = await start(createOrderRoute({ inventoryUrl: inventory.url, repository: createOrderRepository(() => badPool) }));
  try {
    for (const result of [await read(badInventory.url + inventoryPath), await post(badOrders.url, validOrder())]) {
      assert.equal(result.status, 503);
      assert.equal(result.data.error.code, 'DATABASE_UNAVAILABLE');
      assert.ok(!JSON.stringify(result.data).includes('PRIVATE-WRONG-PASSWORD'));
      assert.equal(result.data.items, undefined);
      assert.equal(result.data.confirmationNumber, undefined);
    }
  } finally {
    await badInventory.close();
    await badOrders.close();
    await badPool.end();
  }
});

test('a database stock change after the HTTP check is caught before saving', async () => {
  const counts = await orderRowCounts();
  const server = await start(createOrderRoute({
    inventoryUrl: inventory.url, repository: orderRepository,
    fetchInventory: async (...args) => {
      const response = await fetch(...args);
      // Change stock after reading the API response, before the save transaction.
      const data = await response.json();
      await pool.execute("UPDATE ITEM SET AVAILABLE_QUANTITY = 0 WHERE SLUG = 'ridge-daypack'");
      return { ok: true, json: async () => data };
    },
  }));
  try {
    const result = await post(server.url, validOrder());
    assert.equal(result.status, 409);
    assert.equal(result.data.error.items[0].availableQuantity, 0);
    assert.deepEqual(await orderRowCounts(), counts);
  } finally {
    await pool.execute("UPDATE ITEM SET AVAILABLE_QUANTITY = 12 WHERE SLUG = 'ridge-daypack'");
    await server.close();
  }
});

test('a payment outage does not save an order', async () => {
  const counts = await orderRowCounts();
  const [[{ n: paymentsBefore }]] = await paymentPool.query('SELECT COUNT(*) AS n FROM PAYMENT_INFO');
  const server = await start(createOrderRoute({ inventoryUrl: inventory.url, paymentUrl: 'http://127.0.0.1:9', timeoutMs: 200, repository: orderRepository }));
  try {
    const result = await post(server.url, validOrder());
    assert.equal(result.status, 503);
    assert.equal(result.data.error.code, 'PAYMENT_UNAVAILABLE');
    assert.equal(result.data.confirmationNumber, undefined);
    assert.deepEqual(await orderRowCounts(), counts);
    assert.equal((await paymentPool.query('SELECT COUNT(*) AS n FROM PAYMENT_INFO'))[0][0].n, paymentsBefore);
  } finally {
    await server.close();
  }
});

test('shipping stores an independent shipment and returns a token', async () => {
  const shipping = await start(createShippingRoute(shippingRepository));
  try {
    const result = await read(shipping.url + '/shipping', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ businessId: 'AB-STORE-1001', packetCount: 2, packetWeightsPounds: [2, 1], address: validOrder().shipping }),
    });
    assert.equal(result.status, 201);
    assert.match(result.data.confirmationToken, /^SHP-[A-F0-9]{32}$/);
    const [[row]] = await shippingPool.execute('SELECT BUSINESS_ID, PACKET_COUNT, PACKET_WEIGHTS FROM SHIPMENT WHERE CONFIRMATION_TOKEN = ?', [result.data.confirmationToken]);
    assert.equal(row.BUSINESS_ID, 'AB-STORE-1001');
    assert.equal(row.PACKET_COUNT, 2);
    assert.deepEqual(typeof row.PACKET_WEIGHTS === 'string' ? JSON.parse(row.PACKET_WEIGHTS) : row.PACKET_WEIGHTS, [2, 1]);
    assert.equal((await read(shipping.url + '/shipping')).status, 405);
  } finally {
    await shipping.close();
  }
});

test('publish failure leaves a committed order retryable; duplicate SNS deliveries create one shipment', async () => {
  // Earlier tests leave pending messages. Isolate this dispatch without deleting data.
  await pool.query('UPDATE SHIPMENT_OUTBOX SET NEXT_ATTEMPT_AT = DATE_ADD(NOW(), INTERVAL 1 DAY) WHERE PUBLISHED_AT IS NULL');
  const result = await post(orders.url, validOrder());
  assert.equal(result.status, 201);
  const orderId = result.data.orderId;
  const failed = createOutboxDispatcher(async () => { throw new Error('private transport failure'); }, () => pool);
  assert.equal(await failed(), 'retry');
  const [[pending]] = await pool.execute('SELECT * FROM SHIPMENT_OUTBOX WHERE ORDER_ID = ?', [orderId]);
  assert.equal(pending.PUBLISHED_AT, null);
  assert.equal(pending.ATTEMPTS, 1);
  assert.equal(pending.LAST_ERROR_CODE, 'EVENT_PUBLISH_FAILED');
  assert.equal((await pool.execute('SELECT STATUS FROM CUSTOMER_ORDER WHERE ID = ?', [orderId]))[0][0].STATUS, 'New');
  await pool.execute('UPDATE SHIPMENT_OUTBOX SET NEXT_ATTEMPT_AT = NOW() WHERE ORDER_ID = ?', [orderId]);
  let event;
  const dispatch = createOutboxDispatcher(async detail => { event = eventEnvelope(detail); }, () => pool);
  assert.equal(await dispatch(), 'published');
  assert.equal(await dispatch(), 'idle');
  const sns = { Records: [{ EventSource: 'aws:sns', Sns: { Message: JSON.stringify(event) } }] };
  const handler = createShippingEventHandler(shippingRepository);
  assert.deepEqual(await handler(sns), { processed: 1 });
  assert.deepEqual(await handler(sns), { processed: 1 });
  const [shipments] = await shippingPool.execute('SELECT * FROM SHIPMENT WHERE REQUEST_ID = ?', [pending.EVENT_ID]);
  assert.equal(shipments.length, 1);
  assert.equal(shipments[0].PACKET_COUNT, 2);
  const changed = structuredClone(event);
  changed.detail.packetWeightsPounds = [5, 1];
  await assert.rejects(handler({ Records: [{ EventSource: 'aws:sns', Sns: { Message: JSON.stringify(changed) } }] }),
    error => error.code === 'SHIPMENT_CONFLICT');
  await assert.rejects(createShippingEventHandler({ save: async () => { throw new Error('DB unavailable'); } })(sns),
    /DB unavailable/, 'a failed consumer must request redelivery');
});

test('shipping rejects inconsistent packet weights and malformed SNS messages', async () => {
  const shipping = await start(createShippingRoute(shippingRepository));
  try {
    for (const weights of [undefined, 1, [], [1], [1, 0], [1, -2], [1, 0.001], [1, '2'], [1, 1001]]) {
      const result = await read(shipping.url + '/shipping', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId: 'AB-STORE-1001', packetCount: 2, packetWeightsPounds: weights, address: validOrder().shipping }),
      });
      assert.equal(result.status, 400);
    }
    const handler = createShippingEventHandler(shippingRepository);
    for (const event of [{}, { Records: [] }, { Records: [{ EventSource: 'wrong' }] },
      { Records: [{ EventSource: 'aws:sns', Sns: { Message: '{private-broken' } }] },
      { Records: [{ EventSource: 'aws:sns', Sns: { Message: '{"source":"wrong"}' } }] }]) {
      await assert.rejects(handler(event), error => !error.message.includes('private-broken'));
    }
  } finally { await shipping.close(); }
});

test('partner database users cannot read another service or alter their own schema', async () => {
  for (const [partner, otherTable, ownTable] of [
    [paymentPool, 'adventure_shipping_test.SHIPMENT', 'PAYMENT_INFO'],
    [shippingPool, 'adventure_payment_test.PAYMENT_INFO', 'SHIPMENT'],
  ]) {
    for (const table of [otherTable, 'adventure_beyond_test.CUSTOMER_ORDER']) {
      await assert.rejects(partner.query(`SELECT COUNT(*) FROM ${table}`), error => error.code === 'ER_TABLEACCESS_DENIED_ERROR');
    }
    await assert.rejects(partner.query(`ALTER TABLE ${ownTable} ADD COLUMN UNEXPECTED INT`),
      error => error.code === 'ER_TABLEACCESS_DENIED_ERROR');
  }
});

test('partner APIs accept API Gateway v2 bodies with default and named-stage paths', async () => {
  const paymentHandler = lambdaAdapter(createPaymentRoute(paymentRepository));
  const shippingHandler = lambdaAdapter(createShippingRoute(shippingRepository));
  for (const [stage, prefix] of [['$default', ''], ['dev', '/dev'], ['dev', '']]) {
    const event = {
      version: '2.0', rawPath: `${prefix}/payment`,
      requestContext: { stage, http: { method: 'POST' } },
      headers: { 'content-type': 'application/json' }, body: JSON.stringify(validOrder().payment),
    };
    const paid = await paymentHandler(event);
    assert.equal(paid.statusCode, 201);
    assert.match(JSON.parse(paid.body).confirmationToken, /^PAY-[A-F0-9]{32}$/);
    const sent = await shippingHandler({
      ...event, rawPath: `${prefix}/shipping`,
      body: JSON.stringify({ businessId: 'AB-STORE-1001', packetCount: 2, packetWeightsPounds: [2, 1], address: validOrder().shipping }),
    });
    assert.equal(sent.statusCode, 201);
    assert.match(JSON.parse(sent.body).confirmationToken, /^SHP-[A-F0-9]{32}$/);
  }
});

test('malformed payment responses never create an order or shipping event', async () => {
  const counts = await orderRowCounts();
  for (const data of [null, {}, { confirmationToken: 'PAY-SHORT' }]) {
    const server = await start(createOrderRoute({
      inventoryUrl: inventory.url, repository: orderRepository,
      fetchPayment: async () => ({ ok: true, json: async () => data }),
    }));
    try {
      const response = await post(server.url, validOrder());
      assert.equal(response.status, 503);
      assert.equal(response.data.error.code, 'PAYMENT_UNAVAILABLE');
      assert.deepEqual(await orderRowCounts(), counts);
    } finally { await server.close(); }
  }
});
