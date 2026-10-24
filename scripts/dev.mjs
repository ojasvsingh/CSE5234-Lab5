import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const preview = process.argv.includes('--preview');
const servicesOnly = process.argv.includes('--services-only');
const inventoryPort = process.env.INVENTORY_PORT || '3001';
const orderPort = process.env.ORDER_PORT || '3002';
const env = {
  ...process.env,
  INVENTORY_PORT: inventoryPort,
  ORDER_PORT: orderPort,
  INVENTORY_SERVICE_URL: process.env.INVENTORY_SERVICE_URL || `http://127.0.0.1:${inventoryPort}`,
  ORDER_SERVICE_URL: process.env.ORDER_SERVICE_URL || `http://127.0.0.1:${orderPort}`,
};
const jobs = [['services/inventory/server.js'], ['services/orders/server.js']];
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
