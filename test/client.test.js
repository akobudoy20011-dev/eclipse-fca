'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createClient, TransportError } = require('../src');

test('client starts idle and refuses to pretend it is connected without a transport', async () => {
  const client = createClient();
  assert.equal(client.state, 'idle');
  await assert.rejects(client.connect(), error =>
    error instanceof TransportError && error.code === 'ERR_TRANSPORT_NOT_CONFIGURED'
  );
  assert.equal(client.state, 'idle');
});

test('connects and disconnects through an injected transport', async () => {
  const calls = [];
  const client = createClient({
    transport: {
      async connect(context) {
        calls.push('connect');
        assert.equal(context.config.network.mode, 'direct');
      },
      async disconnect() {
        calls.push('disconnect');
      }
    }
  });

  const events = [];
  client.on('state', state => events.push(state));
  await client.connect();
  assert.equal(client.state, 'connected');
  await client.disconnect();
  assert.equal(client.state, 'disconnected');
  assert.deepEqual(calls, ['connect', 'disconnect']);
  assert.deepEqual(events, ['connecting', 'connected', 'closing', 'disconnected']);
});

test('wraps transport failures and moves client into error state', async () => {
  const client = createClient({
    transport: { async connect() { throw new Error('offline'); } }
  });
  await assert.rejects(client.connect(), error => error.code === 'ERR_TRANSPORT');
  assert.equal(client.state, 'error');
});


test('injects API methods only after a successful appState login', async () => {
  const client = createClient({
    requestClient: {
      async request() {
        return {
          data: '<input name="fb_dtsg" value="fresh-token">"USER_ID":"12345"',
          headers: {}
        };
      }
    }
  });
  assert.equal(client.api, null);
  await client.login([{ key: 'c_user', value: '12345' }, { key: 'xs', value: 'secret' }]);
  assert.equal(typeof client.api.sendMessage, 'function');
  assert.equal(typeof client.api.createPoll, 'function');
  assert.equal(typeof client.api.commentPost, 'function');
  assert.equal(typeof client.api.joinCall, 'function');
  assert.equal(typeof client.api.getThreadInfo, 'function');
  assert.deepEqual(Object.keys(client.session).sort(), ['authenticatedAt', 'tokens', 'userId']);
});
