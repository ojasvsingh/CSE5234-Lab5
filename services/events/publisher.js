import { EventBridgeClient, PutEventsCommand, DescribeEventBusCommand } from '@aws-sdk/client-eventbridge';
import { fromIni } from '@aws-sdk/credential-providers';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export const EVENT_SOURCE = 'adventure-beyond.orders';
export const EVENT_TYPE = 'ShipmentRequested';
export function eventEnvelope(detail) {
  return { version: '0', id: detail.requestId, source: EVENT_SOURCE, 'detail-type': EVENT_TYPE, detail };
}
export function localEventDirectory(env = process.env) {
  return resolve(env.LOCAL_EVENT_DIR || '.local-events', 'shipment-requested');
}
export function createAwsPublisher({ client, busName }) {
  if (!busName) throw new Error('EVENT_BUS_NAME_REQUIRED');
  return async (detail) => {
    // PutEvents can return success for a nonexistent bus. Verify it first.
    await client.send(new DescribeEventBusCommand({ Name: busName }));
    const result = await client.send(new PutEventsCommand({ Entries: [{
      Source: EVENT_SOURCE, DetailType: EVENT_TYPE, EventBusName: busName, Detail: JSON.stringify(detail),
    }] }));
    if (result.FailedEntryCount !== 0 || result.Entries?.length !== 1 || !result.Entries[0].EventId) {
      throw new Error('EVENT_PUBLISH_FAILED');
    }
  };
}
export function createPublisher(env = process.env) {
  const mode = env.EVENT_TRANSPORT || 'local';
  if (mode === 'aws') {
    const client = new EventBridgeClient({
      region: env.RDS_AWS_REGION || env.AWS_REGION || 'us-east-1',
      ...(env.RDS_AWS_PROFILE ? { credentials: fromIni({ profile: env.RDS_AWS_PROFILE }) } : {}),
      maxAttempts: 2,
      requestHandler: { connectionTimeout: 3000, requestTimeout: 5000 },
    });
    return createAwsPublisher({ client, busName: env.EVENT_BUS_NAME });
  }
  if (mode !== 'local') throw new Error('EVENT_TRANSPORT_MUST_BE_LOCAL_OR_AWS');
  return async (detail) => {
    const directory = localEventDirectory(env);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary = resolve(directory, `.${randomUUID()}.tmp`);
    await writeFile(temporary, JSON.stringify(eventEnvelope(detail)), { mode: 0o600, flag: 'wx' });
    await rename(temporary, resolve(directory, `${detail.requestId}.json`));
  };
}
