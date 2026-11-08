import { chromium, devices, expect } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createDatabasePool, partnerDatabaseEnv } from '../services/database/pool.js';
import { openRdsAdmin } from './rds.mjs';
import { createPublisher } from '../services/events/publisher.js';
import { startCheckout, fillPayment, fillShipping } from '../tests/e2e/helpers.js';

const cloud = process.argv.includes('--aws');
const env = cloud ? parseEnv(await readFile(new URL('../.env.lab9', import.meta.url), 'utf8')) : process.env;
if (cloud) {
  const account = execFileSync('aws', ['sts', 'get-caller-identity', '--profile', 'school', '--region', 'us-east-1', '--query', 'Account', '--output', 'text'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  if (account !== '358148451783' || env.EVENT_TRANSPORT !== 'aws' || env.PARTNER_MODE !== 'aws') throw new Error('USE_SCHOOL_AWS_CONFIGURATION');
}
const folder = new URL(`../docs/screenshots/lab9${cloud ? '-aws' : ''}/`, import.meta.url);
await mkdir(folder, { recursive: true });
const store = cloud ? openRdsAdmin().pool : createDatabasePool(env);
const payment = createDatabasePool(partnerDatabaseEnv('payment', env));
const shipping = createDatabasePool(partnerDatabaseEnv('shipping', env));
const browser = await chromium.launch();
const evidence = {
  capturedAt: new Date().toISOString(),
  mode: cloud ? 'AWS payment API + RDS + EventBridge + SNS + shipping Lambda' : 'LOCAL MySQL + local event transport (not AWS)',
  gitCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  uncommittedChanges: Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()),
  orders: [],
};
const asJson = value => typeof value === 'string' ? JSON.parse(value) : value;
try {
  for (const [name, options] of [
    ['desktop', { viewport: { width: 1440, height: 1000 } }],
    ['mobile', { ...devices['iPhone 13'], defaultBrowserType: undefined }],
  ]) {
    const context = await browser.newContext({ ...options, baseURL: 'http://127.0.0.1:5173', reducedMotion: 'reduce' });
    const page = await context.newPage();
    await startCheckout(page);
    await fillPayment(page);
    await fillShipping(page, 'Apt 5');
    await page.screenshot({ path: fileURLToPath(new URL(`${name}-review.png`, folder)), fullPage: true });
    await page.getByRole('checkbox').check();
    const pending = page.waitForResponse(r => r.url().endsWith('/order-processing/order') && r.request().method() === 'POST');
    await page.getByRole('button', { name: /^Place demo order/ }).click();
    const response = await pending;
    expect(response.status()).toBe(201);
    const receipt = await response.json();
    await expect(page.locator('.confirmation-number')).toHaveText(receipt.confirmationNumber);
    const [[order]] = await store.execute('SELECT PAYMENT_CONFIRMATION_TOKEN, PAYMENT_INFO_ID_FK, STATUS FROM CUSTOMER_ORDER WHERE ID = ?', [receipt.orderId]);
    const [[paid]] = await payment.execute('SELECT CONFIRMATION_TOKEN, CARD_NUM, CVV FROM PAYMENT_INFO WHERE CONFIRMATION_TOKEN = ?', [order.PAYMENT_CONFIRMATION_TOKEN]);
    expect(order.PAYMENT_INFO_ID_FK).toBe(null);
    expect(paid.CARD_NUM).toBe('****4242');
    expect(paid.CVV).toBe(null);
    const [[event]] = await store.execute('SELECT EVENT_ID, DETAIL FROM SHIPMENT_OUTBOX WHERE ORDER_ID = ?', [receipt.orderId]);
    const detail = asJson(event.DETAIL);
    expect(detail.packetWeightsPounds).toEqual([2, 1]);
    await expect.poll(async () => (await shipping.execute('SELECT COUNT(*) AS n FROM SHIPMENT WHERE REQUEST_ID = ?', [event.EVENT_ID]))[0][0].n,
      { timeout: cloud ? 90000 : 30000, intervals: [1000, 2000, 3000] }).toBe(1);
    // Redeliver the same event; the carrier must retain the original token.
    const [[shipment]] = await shipping.execute('SELECT CONFIRMATION_TOKEN, PACKET_COUNT, PACKET_WEIGHTS FROM SHIPMENT WHERE REQUEST_ID = ?', [event.EVENT_ID]);
    await createPublisher(env)(detail);
    // Delivery may be asynchronous; this snapshot complements the repeat-delivery API test.
    await new Promise(resolve => setTimeout(resolve, cloud ? 10000 : 2500));
    const [again] = await shipping.execute('SELECT CONFIRMATION_TOKEN FROM SHIPMENT WHERE REQUEST_ID = ?', [event.EVENT_ID]);
    expect(again).toEqual([{ CONFIRMATION_TOKEN: shipment.CONFIRMATION_TOKEN }]);
    const [[delivery]] = await store.execute('SELECT PUBLISHED_AT, ATTEMPTS FROM SHIPMENT_OUTBOX WHERE ORDER_ID = ?', [receipt.orderId]);
    expect(delivery.PUBLISHED_AT).not.toBe(null);
    await page.screenshot({ path: fileURLToPath(new URL(`${name}-confirmation.png`, folder)), fullPage: true });
    evidence.orders.push({
      viewport: name, orderId: receipt.orderId, confirmation: receipt.confirmationNumber,
      totalCents: receipt.totals.totalCents, status: order.STATUS,
      paymentToken: paid.CONFIRMATION_TOKEN, paymentCardMasked: true, cvvStored: false,
      storePaymentReferenceIsNull: true, eventId: event.EVENT_ID,
      eventPublishedAt: delivery.PUBLISHED_AT, publishAttempts: delivery.ATTEMPTS,
      shipmentToken: shipment.CONFIRMATION_TOKEN, packetCount: shipment.PACKET_COUNT,
      packetWeightsPounds: asJson(shipment.PACKET_WEIGHTS), matchingShipmentRowsAfterReplay: again.length,
    });
    await context.close();
  }
  await writeFile(new URL('evidence.json', folder), JSON.stringify(evidence, null, 2) + '\n');
  const page = await browser.newPage({ viewport: { width: 1320, height: 1100 }, deviceScaleFactor: 1 });
  const escape = text => String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  await page.setContent(`<!doctype html><html><head><style>
    body{margin:0;padding:44px;background:#f2f5f2;color:#19382e;font:18px system-ui}
    h1{font-size:34px;margin:8px 0}p{line-height:1.6}section{background:white;border:1px solid #d2ded5;border-radius:16px;padding:24px;margin:20px 0}
    table{width:100%;border-collapse:collapse}td{padding:9px;border-bottom:1px solid #e1e9e3}td:first-child{width:240px;font-weight:600}
    .badge{font-size:14px;font-weight:700;color:#176849}.small{color:#51645c;font-size:14px}
  </style></head><body><div class="badge">CSE 5234 · LAB 9 · ${cloud ? 'AWS' : 'LOCAL'} VERIFICATION</div>
  <h1>Order → Payment → Event → Shipment</h1>
  <p>Values below were read from the three MySQL databases after browser checkout.<br>${escape(evidence.mode)}</p>
  ${evidence.orders.map(order => `<section><h2>${escape(order.viewport)} · ${escape(order.confirmation)} · $${(order.totalCents / 100).toFixed(2)}</h2><table>
    <tr><td>Order status</td><td>${escape(order.status)}</td></tr>
    <tr><td>Payment token</td><td>${escape(order.paymentToken)}</td></tr>
    <tr><td>Shipping event ID</td><td>${escape(order.eventId)}</td></tr>
    <tr><td>Published</td><td>${escape(order.eventPublishedAt)}</td></tr>
    <tr><td>Shipment token</td><td>${escape(order.shipmentToken)}</td></tr>
    <tr><td>Packets / weights</td><td>${order.packetCount} packets / ${order.packetWeightsPounds.join(', ')} lb</td></tr>
    <tr><td>Rows after replay</td><td>${order.matchingShipmentRowsAfterReplay}</td></tr></table></section>`).join('')}
  <p class="small">Captured ${escape(evidence.capturedAt)}. Card number masked in payment DB; CVV absent; store keeps only the payment token.<br>
  ${cloud ? 'Verify routing and Lambda invocation using the AWS stack and CloudWatch as well.' : 'Local simulation demonstrates behavior. It is not proof of AWS EventBridge or SNS deployment.'}</p></body></html>`);
  await page.screenshot({ path: fileURLToPath(new URL('database-verification.png', folder)), fullPage: true });
  console.log(`Saved ${cloud ? 'AWS' : 'local'} evidence and screenshots for orders ${evidence.orders.map(order => order.orderId).join(', ')}.`);
} finally {
  await browser.close();
  await Promise.all([store.end(), payment.end(), shipping.end()]);
}
