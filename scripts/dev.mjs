import '../services/shared/env.js';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const preview = process.argv.includes('--preview');
const servicesOnly = process.argv.includes('--services-only');
const inventoryPort = process.env.INVENTORY_PORT || '3001';
const orderPort = process.env.ORDER_PORT || '3002';
const paymentPort = process.env.PAYMENT_PORT || '3003';
const shippingPort = process.env.SHIPPING_PORT || '3004';
const env = {
  ...process.env,
  INVENTORY_PORT: inventoryPort,
  ORDER_PORT: orderPort,
  PAYMENT_PORT: paymentPort,
  SHIPPING_PORT: shippingPort,
  INVENTORY_SERVICE_URL: process.env.INVENTORY_SERVICE_URL || `http://127.0.0.1:${inventoryPort}`,
  ORDER_SERVICE_URL: process.env.ORDER_SERVICE_URL || `http://127.0.0.1:${orderPort}`,
  PAYMENT_SERVICE_URL: process.env.PAYMENT_SERVICE_URL || `http://127.0.0.1:${paymentPort}`,
  SHIPPING_SERVICE_URL: process.env.SHIPPING_SERVICE_URL || `http://127.0.0.1:${shippingPort}`,
  PAYMENT_DB_NAME: process.env.PAYMENT_DB_NAME || 'adventure_payment',
  SHIPPING_DB_NAME: process.env.SHIPPING_DB_NAME || 'adventure_shipping',
  STORE_BUSINESS_ID: process.env.STORE_BUSINESS_ID || 'AB-STORE-1001',
};
const jobs = [
  ['services/inventory/server.js'],
  ['services/orders/server.js'],
  ['services/payment/server.js'],
  ['services/shipping/server.js'],
];
if (!servicesOnly) jobs.push([
  'node_modules/vite/bin/vite.js', ...(preview ? ['preview'] : []), '--host', '127.0.0.1', '--port', process.env.WEB_PORT || (preview ? '4173' : '5173'), '--strictPort',
]);
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill('SIGTERM');
}
for (const args of jobs) {
  const child = spawn(process.execPath, args, { cwd: root, env, stdio: 'inherit' });
  children.push(child);
  child.once('error', (error) => { console.error(`Could not launch ${args[0]}: ${error.code}`); stop(1); });
  child.once('exit', (code) => { if (!stopping) stop(code || 1); });
}
process.once('SIGINT', () => stop());
process.once('SIGTERM', () => stop());
