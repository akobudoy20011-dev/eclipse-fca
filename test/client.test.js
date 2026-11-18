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

test('injects API methods only after login and does not expose the raw session store', async () => {
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
  assert.equal(client.sessionStore, undefined);
  await client.login([{ key: 'c_user', value: '12345' }, { key: 'xs', value: 'secret' }]);
  assert.equal(typeof client.api.sendMessage, 'function');
  assert.equal(typeof client.api.createPoll, 'function');
  assert.equal(typeof client.api.commentPost, 'function');
  assert.equal(typeof client.api.joinCall, 'function');
  assert.equal(typeof client.api.getThreadInfo, 'function');
  assert.deepEqual(Object.keys(client.session).sort(), ['authenticatedAt', 'tokens', 'userId']);
});

test('automatically attaches cookies only to HTTPS Facebook hosts', async () => {
  const requests = [];
  const client = createClient({
    requestClient: {
      async request(input) {
        requests.push(input);
        return {
          data: '<input name="fb_dtsg" value="fresh-token">"USER_ID":"12345"',
          headers: {}
        };
      }
    }
  });
  await client.login([{ key: 'c_user', value: '12345' }, { key: 'xs', value: 'secret' }]);

  await client.request({ url: 'https://www.facebook.com/me' });
  await client.request({ url: 'https://attacker.example/collect' });

  assert.match(requests[1].headers.cookie, /xs=secret/);
  assert.equal(Object.keys(requests[2].headers).some(key => key.toLowerCase() === 'cookie'), false);
});

test('redacts proxy credentials from the public client configuration', () => {
  const client = createClient({
    network: {
      mode: 'proxy',
      proxy: 'http://proxy-user:proxy-secret@proxy.example:8080'
    },
    requestClient: { async request() { return {}; } }
  });
  assert.equal(client.config.network.mode, 'proxy');
  assert.ok(client.config.network.proxy.includes('[redacted]'));
  assert.equal(client.config.network.proxy.includes('proxy-secret'), false);
});
