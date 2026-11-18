'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createMqttListener } = require('../src/mqtt/client');
const { decodePayload } = require('../src/mqtt/decoder');

const session = {
  userId: '12345',
  cookies: [{ key: 'c_user', value: '12345' }, { key: 'xs', value: 'session' }]
};
const endpoint = 'wss://edge-chat.facebook.com/mqtt';

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

test('requires an explicit secure Facebook WebSocket endpoint', () => {
  assert.throws(() => createMqttListener({ session }), {
    code: 'ERR_CONFIGURATION'
  });
  assert.throws(() => createMqttListener({
    endpoint: 'ws://edge-chat.facebook.com/mqtt',
    session
  }), {
    code: 'ERR_CONFIGURATION'
  });
  assert.throws(() => createMqttListener({
    endpoint: 'wss://facebook.com.attacker.example/mqtt',
    session
  }), {
    code: 'ERR_CONFIGURATION'
  });
});

test('requires an authenticated session and valid topic list', () => {
  assert.throws(() => createMqttListener({
    endpoint,
    session: null
  }), {
    code: 'ERR_CONFIGURATION'
  });
  assert.throws(() => createMqttListener({
    endpoint,
    session,
    topics: 'not-an-array'
  }), {
    code: 'ERR_CONFIGURATION'
  });
});

test('classifies MQTT checkpoint and authentication error payloads', () => {
  const { expiryReasonFromPayload } = require('../src/mqtt/client');
  assert.equal(expiryReasonFromPayload({ type: 'checkpoint' }), 'checkpoint');
  assert.equal(expiryReasonFromPayload({ errorCode: 1357001 }), 'auth_error');
  assert.equal(expiryReasonFromPayload({ type: 'message', text: 'hello' }), null);
});
