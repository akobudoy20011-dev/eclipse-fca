'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createNetworkEngine } = require('../src/network/engine');

function config(overrides = {}) {
  return {
    network: {
      timeout: 100,
      retry: { enabled: true, maxAttempts: 3, initialDelay: 0, maxDelay: 0 },
      ...overrides
    }
  };
}

test('direct mode uses the injected fetch implementation', async () => {
  let called = false;
  const engine = createNetworkEngine({
    ...config(),
    fetch: async () => { called = true; return new Response('ok'); }
  });
  const response = await engine.request('https://example.test');
  assert.equal(await response.text(), 'ok');
  assert.equal(called, true);
  assert.equal(engine.diagnostics().mode, 'direct');
});

test('proxy mode requires and uses an explicit proxy adapter', async () => {
  assert.throws(() => createNetworkEngine({
    ...config({ mode: 'proxy', proxy: 'http://proxy.test:8080' }),
    fetch: async () => new Response('direct')
  }), { code: 'ERR_CONFIGURATION' });

  let usedProxy = false;
  const engine = createNetworkEngine({
    ...config({ mode: 'proxy', proxy: 'http://proxy.test:8080' }),
    proxyAdapter: { fetch: async () => { usedProxy = true; return new Response('proxied'); } }
  });
  assert.equal(await (await engine.request('https://example.test')).text(), 'proxied');
  assert.equal(usedProxy, true);
});

test('retries transient GET failures within the configured bound', async () => {
  let calls = 0;
  const engine = createNetworkEngine({
    ...config(),
    fetch: async () => (++calls < 3 ? new Response('retry', { status: 503 }) : new Response('ok'))
  });
  assert.equal(await (await engine.request('https://example.test')).text(), 'ok');
  assert.equal(calls, 3);
});

test('does not automatically retry POST requests', async () => {
  let calls = 0;
  const engine = createNetworkEngine({
    ...config(),
    fetch: async () => { calls += 1; return new Response('unavailable', { status: 503 }); }
  });
  const response = await engine.request('https://example.test', { method: 'POST', body: 'send' });
  assert.equal(response.status, 503);
  assert.equal(calls, 1);
});

test('allows POST retries only with an idempotency key', async () => {
  let calls = 0;
  const engine = createNetworkEngine({
    ...config(),
    fetch: async () => (++calls < 2 ? new Response('retry', { status: 503 }) : new Response('ok'))
  });
  const response = await engine.request('https://example.test', {
    method: 'POST', headers: { 'idempotency-key': 'request-123' }, body: 'safe retry'
  });
  assert.equal(await response.text(), 'ok');
  assert.equal(calls, 2);
});

test('does not retry caller cancellation', async () => {
  const controller = new AbortController();
  controller.abort();
  const engine = createNetworkEngine({
    ...config(),
    fetch: async () => { throw new Error('should not be called'); }
  });
  await assert.rejects(engine.request('https://example.test', { signal: controller.signal }), {
    name: 'AbortError'
  });
});

test('realtime adapter receives the selected network mode without credentials in diagnostics', () => {
  let received;
  const engine = createNetworkEngine({
    ...config(),
    realtimeFactory: (...args) => { received = args; return 'socket'; }
  });
  assert.equal(engine.openRealtime('wss://example.test'), 'socket');
  assert.equal(received[2].mode, 'direct');
  assert.equal(engine.diagnostics().realtimeConfigured, true);
});
