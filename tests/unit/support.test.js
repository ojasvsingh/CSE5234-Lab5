import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupportPreview, emptySupportRequest, validateSupportRequest } from '../../src/lib/support.js';

const request = {
  name: 'Alex Taylor',
  email: 'alex@example.com',
  topic: 'return',
  orderNumber: 'AB-1234ABCD',
  message: 'I would like help with the daypack from this demo order.',
};

test('a support request accepts a valid email and optional order number', () => {
  assert.deepEqual(validateSupportRequest(request), {});
  assert.deepEqual(validateSupportRequest({ ...request, topic: 'product', orderNumber: '' }), {});
  assert.deepEqual(validateSupportRequest({ ...request, email: ' alex+gear@example.com ', orderNumber: 'ab-1234abcd' }), {});
});

test('support validation identifies missing fields without requiring an order number', () => {
  assert.deepEqual(Object.keys(validateSupportRequest(emptySupportRequest)), ['name', 'email', 'topic', 'message']);
});

test('invalid email, unknown topic, malformed order number, and short messages are rejected', () => {
  const errors = validateSupportRequest({
    ...request, name: '   ', email: 'alex@', topic: 'unknown', orderNumber: '1234', message: '   help   ',
  });
  assert.deepEqual(Object.keys(errors), ['name', 'email', 'topic', 'orderNumber', 'message']);
});

test('the preview routes to the chosen support team and never claims a request was sent', () => {
  const text = createSupportPreview({ ...request, name: ' Alex Taylor ', orderNumber: 'ab-1234abcd' });
  assert.match(text, /Team: Returns support/);
  assert.match(text, /Name: Alex Taylor\n/);
  assert.match(text, /Order number: AB-1234ABCD/);
  assert.match(text, /This request has not been sent/);
  assert.match(text, /not monitored/);
  assert.ok(text.endsWith(request.message));
});

test('general product questions generate a useful preview without an order number', () => {
  const text = createSupportPreview({ ...request, topic: 'product', orderNumber: '' });
  assert.match(text, /Team: Gear support/);
  assert.match(text, /Order number: Not supplied/);
});
