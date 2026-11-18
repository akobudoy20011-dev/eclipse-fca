'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { decodePayload } = require('../src/mqtt/decoder');
const { createMqttListener } = require('../src/mqtt/client');

test('decodes JSON and preserves unknown payloads as raw text', () => {
  assert.deepEqual(decodePayload(Buffer.from('{"type":"message","text":"hello"}')), { type: 'message', text: 'hello' });
  assert.deepEqual(decodePayload('not-json'), { type: 'raw', text: 'not-json' });
});

test('requires an explicit secure MQTT endpoint and authenticated session', () => {
  assert.throws(() => createMqttListener({ endpoint: 'wss://facebook.com' }), /authenticated session/);
  assert.throws(() => createMqttListener({
    endpoint: 'wss://facebook.com',
    session: { userId: '1', cookies: [] }
  }), /topics must be an array/);
});
