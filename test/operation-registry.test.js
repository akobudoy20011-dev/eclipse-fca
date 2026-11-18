'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadOperationsRegistry, mergeOperationRegistries, DEFAULT_REGISTRY_PATH } = require('../src/config/operations');

test('loads the bundled registry with explicit unverified operation placeholders', () => {
  const registry = loadOperationsRegistry();
  assert.deepEqual(Object.keys(registry).sort(), [
    'commentPost', 'createPoll', 'getThreadInfo', 'joinCall', 'sendMessage'
  ]);
  assert.equal(registry.sendMessage.docId, null);
  assert.equal(registry.sendMessage.endpoint, 'https://www.facebook.com/api/graphql/');
  assert.equal(registry.getThreadInfo.mutation, false);
  assert.equal(DEFAULT_REGISTRY_PATH.endsWith('operations.json'), true);
});

test('resolves nested input templates and optional values without evaluating code', () => {
  const registry = loadOperationsRegistry();
  const variables = registry.commentPost.buildVariables({
    postID: 'post-1',
    message: 'hello',
    parentCommentID: null
  }, { userId: 'account-1' });
  assert.deepEqual(variables, {
    input: { postID: 'post-1', message: 'hello', parentCommentID: null }
  });
  const call = registry.joinCall.buildVariables({ threadID: 'thread-1', callType: 'audio' }, {});
  assert.deepEqual(call, { input: { threadID: 'thread-1', callType: 'audio' } });
});

test('rejects missing required template inputs and invalid registry paths', () => {
  const registry = loadOperationsRegistry();
  assert.throws(() => registry.sendMessage.buildVariables({ threadID: 't' }, {}), {
    code: 'ERR_CONFIGURATION'
  });
  assert.throws(() => loadOperationsRegistry({ path: '/path/that/does/not/exist/operations.json' }), {
    code: 'ERR_OPERATION_REGISTRY'
  });
});

test('programmatic verified descriptors override matching bundled placeholders', () => {
  const registry = loadOperationsRegistry();
  const merged = mergeOperationRegistries(registry, {
    sendMessage: {
      docId: 'verified-operation-id',
      buildVariables: input => ({ threadID: input.threadID })
    }
  });
  assert.equal(merged.sendMessage.docId, 'verified-operation-id');
  assert.equal(merged.createPoll.docId, null);
  assert.equal(Object.isFrozen(merged), true);
});

test('rejects unsupported registry descriptor fields and schema versions', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eclipse-registry-'));
  const file = path.join(dir, 'operations.json');
  try {
    fs.writeFileSync(file, JSON.stringify({
      schemaVersion: 1,
      operations: { sendMessage: { doc_id: 'id', variables: {}, shell: 'nope' } }
    }));
    assert.throws(() => loadOperationsRegistry({ path: file }), { code: 'ERR_CONFIGURATION' });
    fs.writeFileSync(file, JSON.stringify({ schemaVersion: 99, operations: {} }));
    assert.throws(() => loadOperationsRegistry({ path: file }), { code: 'ERR_CONFIGURATION' });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('validates registry input schemas before building GraphQL variables', () => {
  const registry = loadOperationsRegistry();
  assert.throws(() => registry.sendMessage.buildVariables({
    threadID: 42,
    body: 'hello'
  }, {}), /invalid type/);
  assert.throws(() => registry.sendMessage.buildVariables({
    threadID: 'thread-1',
    body: 'hello',
    unexpected: true
  }, {}), /unsupported input field/);
  assert.deepEqual(registry.commentPost.buildVariables({
    postID: 'post-1',
    message: 'reply'
  }, {}).input.parentCommentID, null);
});
