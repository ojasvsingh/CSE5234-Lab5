import { createOutboxDispatcher } from '../database/outbox.js';
import { createPublisher } from '../events/publisher.js';

const dispatch = createOutboxDispatcher(createPublisher());
export async function handler(event, context) {
  if (context) context.callbackWaitsForEmptyEventLoop = false;
  let published = 0;
  let retry = 0;
  while (published + retry < 50 && (context?.getRemainingTimeInMillis?.() ?? 120000) > 15000) {
    const result = await dispatch();
    if (result === 'idle') break;
    if (result === 'published') published++;
    else retry++;
  }
  return { published, retry };
}
