import '../shared/env.js';
import { mkdir, readdir, readFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createShippingEventHandler } from './handler.js';
import { closeShippingPool } from '../database/shipments.js';
import { localEventDirectory } from '../events/publisher.js';
import { runWorker } from '../events/run-worker.js';

// Local development simulation only. AWS uses EventBridge -> SNS -> Lambda.
const directory = localEventDirectory();
const handle = createShippingEventHandler();
await mkdir(directory, { recursive: true, mode: 0o700 });
await runWorker('Local shipping subscriber', async () => {
  let failed = false;
  for (const file of (await readdir(directory)).filter(name => name.endsWith('.json'))) {
    const path = resolve(directory, file);
    try {
      const message = await readFile(path, 'utf8');
      await handle({ Records: [{ EventSource: 'aws:sns', Sns: { Message: message } }] });
      await unlink(path);
    } catch { failed = true; }
  }
  if (failed) throw new Error('LOCAL_DELIVERY_RETRY');
}, closeShippingPool);
