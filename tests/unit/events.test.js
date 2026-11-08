import test from 'node:test';
import assert from 'node:assert/strict';
import { createAwsPublisher } from '../../services/events/publisher.js';
import { partnerDatabaseEnv } from '../../services/database/pool.js';

test('AWS publisher checks bus existence and rejects unsuccessful PutEvents entries', async () => {
  for (const result of [
    { FailedEntryCount: 1, Entries: [{ ErrorCode: 'InternalFailure' }] },
    { FailedEntryCount: 0, Entries: [] },
    { FailedEntryCount: 0, Entries: [{}] },
  ]) {
    const calls = [];
    const publish = createAwsPublisher({ busName: 'test-bus', client: { async send(command) {
      calls.push(command.constructor.name);
      return command.constructor.name === 'DescribeEventBusCommand' ? { Name: 'test-bus' } : result;
    } } });
    await assert.rejects(publish({ requestId: 'test-1' }), /EVENT_PUBLISH_FAILED/);
    assert.deepEqual(calls, ['DescribeEventBusCommand', 'PutEventsCommand']);
  }
  const commands = [];
  await createAwsPublisher({ busName: 'test-bus', client: { async send(command) {
    commands.push(command);
    return { FailedEntryCount: 0, Entries: [{ EventId: 'accepted' }] };
  } } })({ requestId: 'test-1' });
  assert.deepEqual(commands[1].input.Entries[0], {
    Source: 'adventure-beyond.orders', DetailType: 'ShipmentRequested',
    EventBusName: 'test-bus', Detail: '{"requestId":"test-1"}',
  });
  let calls = 0;
  await assert.rejects(createAwsPublisher({ busName: 'missing', client: { async send() {
    calls++; throw new Error('ResourceNotFoundException');
  } } })({}), /ResourceNotFoundException/);
  assert.equal(calls, 1, 'do not send an event to a nonexistent bus');
});

test('partner configuration never inherits the storefront database or credentials', () => {
  const env = { DB_HOST: 'store.example', DB_USER: 'store', DB_PASSWORD: 'private', DB_NAME: 'store' };
  for (const kind of ['payment', 'shipping']) {
    const partner = partnerDatabaseEnv(kind, env);
    assert.equal(partner.DB_HOST, '127.0.0.1');
    assert.equal(partner.DB_NAME, `adventure_${kind}`);
    assert.notEqual(partner.DB_USER, env.DB_USER);
    assert.notEqual(partner.DB_PASSWORD, env.DB_PASSWORD);
  }
});
