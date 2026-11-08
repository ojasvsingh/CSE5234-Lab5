import '../shared/env.js';
import { createOutboxDispatcher } from '../database/outbox.js';
import { closeDatabasePool } from '../database/pool.js';
import { createPublisher } from '../events/publisher.js';
import { runWorker } from '../events/run-worker.js';

await runWorker(`Order event publisher (${process.env.EVENT_TRANSPORT || 'local'})`,
  createOutboxDispatcher(createPublisher()), closeDatabasePool);
