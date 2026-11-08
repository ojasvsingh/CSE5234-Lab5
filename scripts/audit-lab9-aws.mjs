import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createDatabasePool, partnerDatabaseEnv } from '../services/database/pool.js';
import { openRdsAdmin } from './rds.mjs';

const profile = 'school';
const region = 'us-east-1';
const aws = (...args) => JSON.parse(execFileSync('aws', [...args, '--profile', profile, '--region', region, '--output', 'json'],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
assert.equal(aws('sts', 'get-caller-identity').Account, '358148451783');
const config = parseEnv(await readFile(new URL('../.env.lab9', import.meta.url), 'utf8'));
const folder = new URL('../docs/screenshots/lab9-aws/', import.meta.url);
const orders = JSON.parse(await readFile(new URL('evidence.json', folder), 'utf8'));
assert.ok(orders.mode.startsWith('AWS'));
const stack = aws('cloudformation', 'describe-stacks', '--stack-name', 'adventure-beyond-lab9').Stacks[0];
assert.ok(['CREATE_COMPLETE', 'UPDATE_COMPLETE'].includes(stack.StackStatus));
const output = Object.fromEntries(stack.Outputs.map(o => [o.OutputKey, o.OutputValue]));
const ruleName = output.ShippingRuleArn.split('/').at(-1);
const rule = aws('events', 'describe-rule', '--name', ruleName, '--event-bus-name', output.EventBusName);
const targets = aws('events', 'list-targets-by-rule', '--rule', ruleName, '--event-bus-name', output.EventBusName).Targets;
assert.equal(rule.State, 'ENABLED');
assert.deepEqual(JSON.parse(rule.EventPattern).source, ['adventure-beyond.orders']);
assert.deepEqual(JSON.parse(rule.EventPattern)['detail-type'], ['ShipmentRequested']);
assert.ok(targets.some(t => t.Arn === output.ShippingTopicArn));
const subscriptions = aws('sns', 'list-subscriptions-by-topic', '--topic-arn', output.ShippingTopicArn).Subscriptions;
const functions = {};
for (const kind of ['Payment', 'Shipping']) {
  // Whitelist fields: function environment variables contain database secrets.
  functions[kind.toLowerCase()] = aws('lambda', 'get-function-configuration', '--function-name', output[`${kind}FunctionName`],
    '--query', '{name:FunctionName,arn:FunctionArn,state:State,update:LastUpdateStatus,runtime:Runtime,handler:Handler,vpc:VpcConfig.VpcId}');
  assert.equal(functions[kind.toLowerCase()].state, 'Active');
  assert.equal(functions[kind.toLowerCase()].update, 'Successful');
}
assert.ok(subscriptions.some(s => s.Protocol === 'lambda' && s.Endpoint === functions.shipping.arn && s.SubscriptionArn !== 'PendingConfirmation'));
const invokePolicy = JSON.parse(aws('lambda', 'get-policy', '--function-name', output.ShippingFunctionName).Policy);
assert.ok(invokePolicy.Statement.some(s => s.Principal?.Service === 'sns.amazonaws.com'
  && s.Condition?.ArnLike?.['AWS:SourceArn'] === output.ShippingTopicArn));
const queue = aws('sqs', 'get-queue-attributes', '--queue-url', output.DeliveryFailuresUrl,
  '--attribute-names', 'ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesNotVisible', 'ApproximateNumberOfMessagesDelayed').Attributes;
assert.ok(Object.values(queue).every(n => n === '0'), 'delivery failure queue must be empty');
const rds = aws('rds', 'describe-db-instances', '--db-instance-identifier', 'adventure-beyond-lab8',
  '--query', 'DBInstances[0].{status:DBInstanceStatus,engine:Engine,version:EngineVersion,instance:DBInstanceIdentifier,class:DBInstanceClass}');
assert.equal(rds.status, 'available');
const reports = {};
for (const kind of ['payment', 'shipping']) {
  const logGroup = `/aws/lambda/${functions[kind].name}`;
  const events = aws('logs', 'filter-log-events', '--log-group-name', logGroup,
    '--start-time', String(Date.parse(orders.capturedAt)), '--filter-pattern', '"REPORT RequestId"').events;
  reports[kind] = events.map(e => ({ timestamp: new Date(e.timestamp).toISOString(), report: e.message.trim() }));
  assert.ok(events.length >= (kind === 'shipping' ? 4 : 2), 'expected payment and repeated shipping invocations');
}
const store = openRdsAdmin().pool;
const storeApp = createDatabasePool(config);
const payment = createDatabasePool(partnerDatabaseEnv('payment', config));
const shipping = createDatabasePool(partnerDatabaseEnv('shipping', config));
const checks = {};
try {
  const [[pending]] = await store.query('SELECT COUNT(*) AS n FROM SHIPMENT_OUTBOX WHERE PUBLISHED_AT IS NULL');
  assert.equal(pending.n, 0);
  checks.unpublishedOrders = pending.n;
  for (const [name, pool, other] of [
    ['payment', payment, 'adventure_shipping.SHIPMENT'],
    ['shipping', shipping, 'adventure_payment.PAYMENT_INFO'],
  ]) {
    for (const table of [other, 'adventure_beyond.CUSTOMER_ORDER']) {
      await assert.rejects(pool.query(`SELECT COUNT(*) FROM ${table}`), e => e.code === 'ER_TABLEACCESS_DENIED_ERROR');
    }
    checks[`${name}DatabaseIsolated`] = true;
  }
  for (const table of ['adventure_payment.PAYMENT_INFO', 'adventure_shipping.SHIPMENT']) {
    await assert.rejects(storeApp.query(`SELECT COUNT(*) FROM ${table}`), e => e.code === 'ER_TABLEACCESS_DENIED_ERROR');
  }
  checks.storeCannotReadPartnerDatabases = true;
  const [[legacy]] = await store.query('SELECT COUNT(*) AS n FROM CUSTOMER_ORDER WHERE PAYMENT_INFO_ID_FK IS NOT NULL');
  checks.preservedLegacyOrders = legacy.n;
  const [[legacyPayments]] = await store.query('SELECT COUNT(*) AS n FROM PAYMENT_INFO');
  checks.legacyPaymentRows = legacyPayments.n;
  let priorOrders;
  try { priorOrders = JSON.parse(await readFile(new URL('../.lab9-build/prior-orders.json', import.meta.url), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (priorOrders) {
    const [current] = await store.query('SELECT o.ID, o.STATUS, COUNT(li.ID) AS LINE_COUNT, SUM(li.QUANTITY * li.UNIT_PRICE) AS TOTAL FROM CUSTOMER_ORDER o JOIN CUSTOMER_ORDER_LINE_ITEM li ON li.CUSTOMER_ORDER_ID_FK=o.ID GROUP BY o.ID ORDER BY o.ID');
    const ids = new Set(priorOrders.map(o => o.ID));
    assert.deepEqual(current.filter(o => ids.has(o.ID)), priorOrders);
    checks.priorOrdersUnchanged = priorOrders.length;
  }
  const counts = async () => ({
    orders: (await store.query('SELECT COUNT(*) AS n FROM CUSTOMER_ORDER'))[0][0].n,
    events: (await store.query('SELECT COUNT(*) AS n FROM SHIPMENT_OUTBOX'))[0][0].n,
    payments: (await payment.query('SELECT COUNT(*) AS n FROM PAYMENT_INFO'))[0][0].n,
  });
  const before = await counts();
  const sample = JSON.parse(await readFile(new URL('../examples/order.json', import.meta.url), 'utf8'));
  sample.items[0].quantity = 99;
  const rejected = await fetch('http://127.0.0.1:3002/order-processing/order', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sample),
  });
  assert.equal(rejected.status, 409);
  assert.deepEqual(await counts(), before);
  checks.insufficientStockCreatesNoPaymentOrderOrEvent = true;
  // Exercise the public shipping API with the same request ID as an SNS-delivered shipment.
  const [[outbox]] = await store.execute('SELECT DETAIL FROM SHIPMENT_OUTBOX WHERE ORDER_ID = ?', [orders.orders[0].orderId]);
  const detail = typeof outbox.DETAIL === 'string' ? JSON.parse(outbox.DETAIL) : outbox.DETAIL;
  const response = await fetch(`${output.ShippingApiUrl}/shipping`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(detail),
  });
  assert.equal(response.status, 201);
  assert.equal((await response.json()).confirmationToken, orders.orders[0].shipmentToken);
  checks.shippingHttpApiReturnsOriginalToken = true;
} finally {
  await Promise.all([store.end(), storeApp.end(), payment.end(), shipping.end()]);
}
const evidence = {
  capturedAt: new Date().toISOString(), account: '358148451783', region,
  source: 'Live AWS CLI responses and RDS queries; not an AWS Console screenshot',
  stackStatus: stack.StackStatus, rds, functions,
  eventRule: { name: rule.Name, state: rule.State, bus: output.EventBusName, pattern: JSON.parse(rule.EventPattern), targets },
  sns: { topic: output.ShippingTopicArn, subscriptions }, invokePolicy, failureQueue: queue,
  lambdaReports: reports, checks,
};
await mkdir(folder, { recursive: true });
await writeFile(new URL('cloud-verification.json', folder), JSON.stringify(evidence, null, 2) + '\n');
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1320, height: 1180 } });
  const esc = text => String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  await page.setContent(`<!doctype html><html><head><style>
    body{margin:0;padding:42px;font:18px system-ui;background:#f2f5f2;color:#19382e}
    h1{font-size:34px}section{background:white;border:1px solid #d2ded5;border-radius:16px;padding:24px;margin:20px 0}
    table{width:100%;border-collapse:collapse}td{padding:10px;border-bottom:1px solid #e1e9e3}
    td:first-child{width:270px;font-weight:600}code,pre{font-size:15px;white-space:pre-wrap;overflow-wrap:anywhere}
    p{line-height:1.6}.small{font-size:14px;color:#51645c}
    </style></head><body><b>CSE 5234 · LAB 9 · LIVE AWS VERIFICATION</b>
    <h1>EventBridge → SNS → Shipping Lambda</h1>
    <p>School account ${evidence.account} · ${region} · ${esc(evidence.capturedAt)}</p>
    <section><table>
    <tr><td>CloudFormation</td><td>${stack.StackStatus}</td></tr>
    <tr><td>Existing RDS instance</td><td>${rds.instance} · ${rds.status} · MySQL ${rds.version}</td></tr>
    <tr><td>Payment / shipping</td><td>2 active Lambda functions, ${functions.payment.runtime}, separate DB accounts</td></tr>
    <tr><td>Event bus</td><td>${esc(output.EventBusName)}</td></tr>
    <tr><td>Rule and SNS target</td><td>${rule.State} · configured</td></tr>
    <tr><td>SNS subscription</td><td>Confirmed → shipping Lambda</td></tr>
    <tr><td>Invocation permission</td><td>SNS topic ARN restricted in Lambda policy</td></tr>
    <tr><td>Pending outbox / failure queue</td><td>0 / 0 messages</td></tr>
    <tr><td>Legacy orders preserved</td><td>${checks.preservedLegacyOrders}</td></tr>
    <tr><td>Database isolation / stock checks</td><td>Passed</td></tr></table></section>
    <section><h2>Event rule pattern</h2><pre>${esc(JSON.stringify(evidence.eventRule.pattern, null, 2))}</pre></section>
    <section><h2>Observed Lambda invocations</h2>
    <p>Payment: ${reports.payment.length} · Shipping: ${reports.shipping.length} (includes repeated delivery)</p>
    <pre>${esc(reports.shipping.slice(-2).map(e => `${e.timestamp}\n${e.report}`).join('\n\n'))}</pre></section>
    <p class="small">${esc(evidence.source)}. Current status may change after capture; see verification notes for shutdown.<br>
    Credentials, customer addresses, and request bodies are omitted. Full sanitized evidence is in cloud-verification.json.</p></body></html>`);
  await page.screenshot({ path: fileURLToPath(new URL('cloud-verification.png', folder)), fullPage: true });
} finally { await browser.close(); }
console.log('Verified live AWS routing, invocation permissions, database isolation, and stock rejection. Evidence saved.');
