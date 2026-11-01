import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServiceServer } from '../../services/shared/http.js';
import { createInventoryRoute } from '../../services/inventory/handler.js';
import { createOrderRoute } from '../../services/orders/handler.js';
import { lambdaAdapter } from '../../services/shared/lambda.js';
import { json } from '../../services/shared/responses.js';
import { createItemRepository } from '../../services/database/items.js';
import { createOrderRepository } from '../../services/database/orders.js';
import { createDatabasePool } from '../../services/database/pool.js';
import { createTestPool, prepareTestDatabase, testDatabaseEnv } from '../fixtures/database.js';
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
let inventoryCalls = 0;
const pool = createTestPool();
const itemRepository = createItemRepository(() => pool);
const orderRepository = createOrderRepository(() => pool);
before(async () => {
  await prepareTestDatabase();
  const route = createInventoryRoute(itemRepository);
  inventory = await start(request => { inventoryCalls += 1; return route(request); });
  orders = await start(createOrderRoute({ inventoryUrl: inventory.url, repository: orderRepository }));
});
after(async () => { await orders?.close(); await inventory?.close(); await pool.end(); });

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
  const orderHandler = lambdaAdapter(createOrderRoute({ inventoryUrl: inventory.url, repository: orderRepository }));
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
    const [[saved]] = await freshPool.execute(`SELECT o.*, s.ADDRESS1, s.COUNTRY, s.EMAIL, p.HOLDER_NAME, p.CARD_NUM, p.CVV
      FROM CUSTOMER_ORDER o JOIN SHIPPING_INFO s ON s.ID = o.SHIPPING_INFO_ID_FK
      JOIN PAYMENT_INFO p ON p.ID = o.PAYMENT_INFO_ID_FK WHERE o.ID = ?`, [result.data.orderId]);
    assert.equal(saved.STATUS, 'New');
    assert.equal(saved.CUSTOMER_NAME, "Alex O'Taylor");
    assert.equal(saved.CUSTOMER_EMAIL, 'alex@example.com');
    assert.equal(saved.EMAIL, saved.CUSTOMER_EMAIL);
    assert.equal(saved.COUNTRY, 'US');
    assert.equal(saved.ADDRESS1, '123 Trailhead Lane');
    assert.equal(saved.CARD_NUM, '****4242');
    assert.equal(saved.CVV, null);
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
  const tables = ['CUSTOMER_ORDER', 'CUSTOMER_ORDER_LINE_ITEM', 'SHIPPING_INFO', 'PAYMENT_INFO'];
  return Promise.all(tables.map(async table => (await pool.query(`SELECT COUNT(*) AS n FROM ${table}`))[0][0].n));
}

test('a failed line insert rolls back the order, payment, shipping, and earlier lines', async () => {
  const counts = await orderRowCounts();
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
  const server = await start(createOrderRoute({ inventoryUrl: inventory.url, repository: failingRepository }));
  try {
    const result = await post(server.url, validOrder());
    assert.equal(result.status, 503);
    assert.equal(result.data.error.code, 'DATABASE_UNAVAILABLE');
    assert.equal(insertedLines, 2);
    assert.equal(result.data.confirmationNumber, undefined);
    assert.ok(!JSON.stringify(result.data).includes('private SQL'));
    assert.deepEqual(await orderRowCounts(), counts);
  } finally {
    await server.close();
  }
});

test('shortage, invalid email, and unsupported country do not create partial orders', async () => {
  const counts = await orderRowCounts();
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
