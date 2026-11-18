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
          data: '<input name="fb_dtsg" value="fresh-token"><script>"USER_ID":"12345"</script>',
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
  assert.deepEqual(Object.keys(client.session).sort(), ['authenticatedAt', 'userId']);
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
  assert.ok(decodeURIComponent(client.config.network.proxy).includes('[redacted]'));
  assert.equal(client.config.network.proxy.includes('proxy-secret'), false);
});

test('client request profile overrides conflicting browser identity headers', async () => {
  let captured;
  const client = createClient({
    browserProfile: {
      userAgent: 'Configured-UA',
      secChUa: '"Chromium";v="131"'
    },
    requestClient: {
      async request(input) {
        captured = input;
        return { status: 200, data: 'ok', headers: {} };
      }
    }
  });
  await client.request({
    url: 'https://www.facebook.com/',
    headers: { 'user-agent': 'Caller-UA', 'sec-ch-ua': 'Caller-CH-UA' }
  });
  assert.equal(captured.headers['user-agent'], 'Configured-UA');
  assert.equal(captured.headers['sec-ch-ua'], '"Chromium";v="131"');
  assert.equal(captured.headers['sec-fetch-mode'], 'cors');
});

test('client loads a custom operation registry and applies verified descriptors', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eclipse-client-registry-'));
  const registryPath = path.join(dir, 'operations.json');
  fs.writeFileSync(registryPath, JSON.stringify({
    schemaVersion: 1,
    operations: {
      getThreadInfo: {
        doc_id: 'synthetic-verified-id',
        endpoint: 'https://www.facebook.com/api/graphql/',
        friendly_name: 'GetThreadInfo',
        mutation: false,
        input_schema: {
          type: 'object',
          required: ['threadID'],
          additionalProperties: false,
          properties: { threadID: { type: 'string' } }
        },
        variables: { input: { threadID: { '$input': 'threadID' } } }
      }
    }
  }));
  let sent;
  try {
    const client = createClient({
      operationRegistryPath: registryPath,
      pacing: { mutationJitterMinMs: 0, mutationJitterMaxMs: 0 },
      requestClient: {
        async request(input) {
          if (input.method !== 'POST') {
            return {
              data: '<input name="fb_dtsg" value="fresh-token">"USER_ID":"12345"',
              status: 200,
              headers: {}
            };
          }
          sent = input;
          return { data: '{"data":{"thread":{"id":"thread-1"}}}', status: 200, headers: {} };
        }
      }
    });
    await client.login([
      { key: 'c_user', value: '12345' },
      { key: 'xs', value: 'session-cookie' }
    ]);
    const result = await client.api.getThreadInfo('thread-1');
    assert.deepEqual(result, { data: { thread: { id: 'thread-1' } } });
    assert.equal(new URLSearchParams(sent.data).get('doc_id'), 'synthetic-verified-id');
    assert.deepEqual(JSON.parse(new URLSearchParams(sent.data).get('variables')), {
      input: { threadID: 'thread-1' }
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
