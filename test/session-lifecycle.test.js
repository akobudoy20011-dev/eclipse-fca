'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { FileSessionStore } = require('../src/storage/file-store');
const { MemorySessionStore } = require('../src/storage/memory-store');
const { SessionManager, responseExpiryReason } = require('../src/core/session-manager');
const { SessionCircuitBreaker } = require('../src/core/circuit-breaker');
const { TokenRefreshScheduler } = require('../src/core/token-refresh');
const { createClient } = require('../src');

const session = {
  userId: '12345',
  cookies: [
    { key: 'c_user', value: '12345' },
    { key: 'xs', value: 'session-one' },
    { key: 'fr', value: 'fr-one' }
  ],
  tokens: { fb_dtsg: 'token-one', lsd: 'lsd-one', jazoest: '22001', userId: '12345' },
  authenticatedAt: new Date(0).toISOString()
};

test('file session store atomically persists private session files', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'eclipse-session-'));
  try {
    const store = new FileSessionStore({ directory });
    await store.set('primary', session);
    assert.deepEqual(await store.get('primary'), session);
    const files = await fs.readdir(directory);
    assert.equal(files.length, 1);
    const stat = await fs.stat(path.join(directory, files[0]));
    assert.equal(stat.mode & 0o777, 0o600);
    assert.equal(files.some(name => name.endsWith('.tmp')), false);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('critical Set-Cookie changes are written back to session storage', async () => {
  const store = new MemorySessionStore();
  const manager = new SessionManager({ sessionStore: store });
  await manager.setSession(session);
  await manager.handleResponse({
    status: 200,
    headers: { 'set-cookie': ['xs=session-two; Path=/', 'fr=fr-two; Path=/'] },
    data: 'ok'
  });
  const persisted = await store.get('default');
  assert.equal(persisted.cookies.find(cookie => cookie.key === 'xs').value, 'session-two');
  assert.equal(persisted.cookies.find(cookie => cookie.key === 'fr').value, 'fr-two');
});

test('non-critical cookie changes do not trigger a session store write', async () => {
  let writes = 0;
  const store = { async set() { writes += 1; } };
  const manager = new SessionManager({ sessionStore: store });
  await manager.setSession(session);
  await manager.handleResponse({
    status: 200,
    headers: { 'set-cookie': ['presence=active; Path=/'] },
    data: 'ok'
  });
  assert.equal(writes, 1);
});

test('refresh mutex coalesces concurrent refreshes and blocks waiting requests', async () => {
  const store = new MemorySessionStore();
  let calls = 0;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const manager = new SessionManager({
    sessionStore: store,
    refreshProvider: async current => {
      calls += 1;
      await gate;
      return { userId: current.userId, tokens: { fb_dtsg: 'token-two' } };
    }
  });
  await manager.setSession(session);
  const first = manager.refreshTokens();
  const second = manager.refreshTokens();
  const waiting = manager.waitForRefresh();
  await Promise.resolve();
  assert.equal(calls, 1);
  release();
  assert.equal(await first, true);
  assert.equal(await second, true);
  await waiting;
  assert.equal((await store.get('default')).tokens.fb_dtsg, 'token-two');
});

test('session circuit breaker trips once and blocks future work', () => {
  const breaker = new SessionCircuitBreaker();
  assert.equal(breaker.trip('checkpoint'), true);
  assert.equal(breaker.trip('auth_error'), false);
  assert.equal(breaker.reason, 'checkpoint');
  assert.throws(() => breaker.assertClosed(), { code: 'ERR_SESSION_INVALIDATED' });
});

test('expiry classifier recognizes checkpoint redirects and auth error codes', () => {
  assert.equal(responseExpiryReason({
    status: 302,
    headers: { location: 'https://www.facebook.com/checkpoint/?next' },
    data: ''
  }), 'checkpoint');
  assert.equal(responseExpiryReason({
    status: 200,
    headers: {},
    data: '{"errors":[{"code":1357004}]}'
  }), 'auth_error');
  assert.equal(responseExpiryReason({ status: 200, headers: {}, data: 'normal response' }), null);
});

test('token refresh scheduler applies bounded jitter and can stop', () => {
  const scheduler = new TokenRefreshScheduler({
    sessionManager: { async refreshTokens() {} },
    baseIntervalMs: 2700000,
    jitterMs: 300000,
    random: () => 0
  });
  assert.equal(scheduler.nextDelay(), 2400000);
  scheduler.start();
  scheduler.stop();
  assert.equal(scheduler.running, false);
});

test('client persists critical cookie rotations and stops its scheduler on disconnect', async () => {
  const store = new MemorySessionStore();
  let call = 0;
  const client = createClient({
    sessionStore: store,
    requestClient: {
      async request() {
        call += 1;
        if (call === 1) {
          return {
            status: 200,
            data: '<input name="fb_dtsg" value="fresh-token">"USER_ID":"12345"',
            headers: {}
          };
        }
        return {
          status: 200,
          data: 'ok',
          headers: { 'set-cookie': ['xs=session-rotated; Path=/'] }
        };
      }
    }
  });
  await client.login([
    { key: 'c_user', value: '12345' },
    { key: 'xs', value: 'session-one' }
  ]);
  assert.equal(client.state, 'authenticated');
  await client.request({ url: 'https://www.facebook.com/me' });
  assert.equal((await store.get('default')).cookies.find(cookie => cookie.key === 'xs').value, 'session-rotated');
  await client.disconnect();
  assert.equal(client.state, 'disconnected');
});

test('client marks stored session invalidated and blocks later requests after checkpoint redirect', async () => {
  const store = new MemorySessionStore();
  let call = 0;
  const client = createClient({
    sessionStore: store,
    requestClient: {
      async request() {
        call += 1;
        if (call === 1) {
          return {
            status: 200,
            data: '<input name="fb_dtsg" value="fresh-token">"USER_ID":"12345"',
            headers: {}
          };
        }
        return {
          status: 302,
          data: '',
          headers: { location: 'https://www.facebook.com/checkpoint/' }
        };
      }
    }
  });
  let expired;
  client.once('session_expired', event => { expired = event; });
  await client.login([
    { key: 'c_user', value: '12345' },
    { key: 'xs', value: 'session-one' }
  ]);
  await client.request({ url: 'https://www.facebook.com/me' });
  assert.equal(expired.type, 'session_expired');
  assert.equal(expired.reason, 'checkpoint');
  assert.equal(client.state, 'invalidated');
  assert.equal((await store.get('default')).invalidated, true);
  await assert.rejects(client.request({ url: 'https://www.facebook.com/me' }), {
    code: 'ERR_SESSION_INVALIDATED'
  });
});
