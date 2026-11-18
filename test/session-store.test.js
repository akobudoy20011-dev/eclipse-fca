'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { MemorySessionStore } = require('../src');

test('stores, retrieves, deletes, and clears session values', async () => {
  const store = new MemorySessionStore();
  await store.set('account', { token: 'test-only' });
  assert.deepEqual(await store.get('account'), { token: 'test-only' });
  assert.equal(await store.delete('account'), true);
  assert.equal(await store.get('account'), null);
  await store.set('another', { value: 1 });
  await store.clear();
  assert.equal(await store.get('another'), null);
});

test('rejects empty session keys', async () => {
  const store = new MemorySessionStore();
  await assert.rejects(store.set('', {}), TypeError);
});
