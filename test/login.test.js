'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loginWithAppState } = require('../src/core/login');
const { extractPageTokens } = require('../src/core/token-manager');
const { normalizeAppState, serializeCookies } = require('../src/utils/cookies');

test('normalizes appState and requires authenticated session cookies', () => {
  const cookies = normalizeAppState([
    { key: 'c_user', value: '12345' },
    { key: 'xs', value: 'session-value' }
  ]);
  assert.equal(serializeCookies(cookies), 'c_user=12345; xs=session-value');
  assert.throws(() => normalizeAppState([{ key: 'c_user', value: '1' }]), /c_user and xs/);
});

test('extracts page tokens from supported HTML/JSON patterns', () => {
  const tokens = extractPageTokens(
    '<input name="fb_dtsg" value="token-1"><input name="jazoest" value="22001"><input name="lsd" value="lsd-1">"USER_ID":"12345"'
  );
  assert.equal(tokens.fb_dtsg, 'token-1');
  assert.equal(tokens.jazoest, '22001');
  assert.equal(tokens.lsd, 'lsd-1');
  assert.equal(tokens.userId, '12345');
});

test('appState login persists cookies and extracted tokens', async () => {
  let saved;
  const result = await loginWithAppState({
    appState: [{ key: 'c_user', value: '12345' }, { key: 'xs', value: 'secret' }],
    requestClient: {
      async request(options) {
        assert.match(options.headers.cookie, /c_user=12345/);
        return {
          data: '<input name="fb_dtsg" value="fresh-token">"USER_ID":"12345"',
          headers: { 'set-cookie': ['presence=C%7B; Path=/'] }
        };
      }
    },
    sessionStore: { async set(key, value) { saved = { key, value }; } }
  });
  assert.equal(result.userId, '12345');
  assert.equal(result.tokens.fb_dtsg, 'fresh-token');
  assert.equal(saved.key, 'default');
  assert.ok(result.cookies.some(cookie => cookie.key === 'presence'));
});

test('rejects an untrusted login URL before sending appState cookies', async () => {
  let requested = false;
  await assert.rejects(loginWithAppState({
    appState: [{ key: 'c_user', value: '12345' }, { key: 'xs', value: 'secret' }],
    homeUrl: 'https://attacker.example/collect',
    requestClient: { async request() { requested = true; } },
    sessionStore: { async set() {} }
  }), { code: 'ERR_CONFIGURATION' });
  assert.equal(requested, false);
});

test('rejects appState sessions redirected to checkpoint without persisting them', async () => {
  let saved = false;
  await assert.rejects(loginWithAppState({
    appState: [{ key: 'c_user', value: '12345' }, { key: 'xs', value: 'secret' }],
    requestClient: {
      async request() {
        return {
          status: 302,
          data: '',
          headers: { location: 'https://www.facebook.com/checkpoint/' }
        };
      }
    },
    sessionStore: { async set() { saved = true; } }
  }), { code: 'ERR_AUTH_SESSION_REJECTED' });
  assert.equal(saved, false);
});
