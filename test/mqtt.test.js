'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createMqttListener } = require('../src/mqtt/client');
const { decodePayload } = require('../src/mqtt/decoder');

const session = {
  userId: '12345',
  cookies: [{ key: 'c_user', value: '12345' }, { key: 'xs', value: 'session' }]
};

test('decodes JSON MQTT payloads', () => {
  assert.deepEqual(decodePayload(Buffer.from('{"type":"message","text":"hello"}')), {
    type: 'message',
    text: 'hello'
  });
});

test('preserves unrecognized MQTT payloads as raw text', () => {
  assert.deepEqual(decodePayload(Buffer.from([0xff, 0x00])), {
    type: 'raw',
    text: '\ufffd\u0000'
  });
});

test('requires an explicit secure WebSocket endpoint', () => {
  assert.throws(() => createMqttListener({ session }), {
    code: 'ERR_CONFIGURATION'
  });
  assert.throws(() => createMqttListener({
    endpoint: 'ws://example.test/mqtt',
    session
  }), {
    code: 'ERR_CONFIGURATION'
  });
});

test('requires an authenticated session and valid topic list', () => {
  assert.throws(() => createMqttListener({
    endpoint: 'wss://example.test/mqtt',
    session: null
  }), {
    code: 'ERR_CONFIGURATION'
  });
  assert.throws(() => createMqttListener({
    endpoint: 'wss://example.test/mqtt',
    session,
    topics: 'not-an-array'
  }), {
    code: 'ERR_CONFIGURATION'
  });
});
