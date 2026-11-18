'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeConfig, DEFAULT_CONFIG } = require('../src/core/config');

test('defaults to direct networking and memory sessions', () => {
  const config = normalizeConfig();
  assert.equal(config.network.mode, 'direct');
  assert.equal(config.network.proxy, null);
  assert.equal(config.session.storage, 'memory');
  assert.equal(config.network.timeout, 30000);
});

test('allows explicitly configured proxy mode', () => {
  const config = normalizeConfig({
    network: { mode: 'proxy', proxy: 'http://127.0.0.1:8080' }
  });
  assert.equal(config.network.mode, 'proxy');
  assert.equal(config.network.proxy, 'http://127.0.0.1:8080');
});

test('rejects proxy mode without a proxy URL', () => {
  assert.throws(() => normalizeConfig({ network: { mode: 'proxy' } }), {
    code: 'ERR_CONFIGURATION'
  });
});

test('rejects invalid modes and timeout values', () => {
  assert.throws(() => normalizeConfig({ network: { mode: 'automatic' } }));
  assert.throws(() => normalizeConfig({ network: { timeout: 0 } }));
});

test('returns immutable normalized configuration', () => {
  const config = normalizeConfig();
  assert.ok(Object.isFrozen(config));
  assert.ok(Object.isFrozen(config.network));
  assert.ok(Object.isFrozen(DEFAULT_CONFIG));
});

test('supports opt-in atomic file session storage configuration', () => {
  const config = normalizeConfig({
    session: { storage: 'file', directory: './.eclipse-sessions' }
  });
  assert.equal(config.session.storage, 'file');
  assert.equal(config.session.directory, './.eclipse-sessions');
  assert.throws(() => normalizeConfig({ session: { storage: 'file' } }), {
    code: 'ERR_CONFIGURATION'
  });
});
