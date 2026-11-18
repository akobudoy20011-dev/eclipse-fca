'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeMentions } = require('../src/api/sendMessage');
const { loadApi } = require('../src/core/api-loader');

test('mention ranges validate tag positions and lengths', () => {
  assert.deepEqual(normalizeMentions([{ tag: '@Sam', id: '42', fromIndex: 3 }]), [
    { tag: '@Sam', id: '42', fromIndex: 3, length: 4 }
  ]);
  assert.throws(() => normalizeMentions([{ tag: '@Sam', id: '42', fromIndex: -1 }]), /fromIndex/);
});

test('API modules are injected as named methods and require verified operation descriptors', async () => {
  const client = {
    session: { userId: '123', tokens: { fb_dtsg: 'token' } },
    request: async () => ({ data: '{}' })
  };
  const api = loadApi(client);
  assert.equal(typeof api.sendMessage, 'function');
  assert.equal(typeof api.createPoll, 'function');
  assert.equal(typeof api.commentPost, 'function');
  assert.equal(typeof api.joinCall, 'function');
  assert.equal(typeof api.getThreadInfo, 'function');
  await assert.rejects(api.sendMessage({ threadID: 't1', body: 'hello' }), /No verified API operation descriptor/);
});

test('sendMessage serializes caller-supplied operation variables', async () => {
  let request;
  const client = {
    session: { userId: '123', tokens: { fb_dtsg: 'token', lsd: 'lsd', jazoest: '22001' } },
    async request(input) { request = input; return { data: '{"data":{"ok":true}}', status: 200 }; }
  };
  const api = loadApi(client, {
    operations: {
      sendMessage: {
        docId: 'verified-doc-id',
        buildVariables: input => ({ threadID: input.threadID, message: input.body, ranges: input.mentions })
      }
    }
  });
  const result = await api.sendMessage({
    threadID: 'thread-1',
    body: 'Hi @Sam',
    mentions: [{ tag: '@Sam', id: '42', fromIndex: 3 }]
  });
  assert.deepEqual(result, { data: { ok: true } });
  const form = new URLSearchParams(request.data);
  assert.equal(form.get('doc_id'), 'verified-doc-id');
  assert.deepEqual(JSON.parse(form.get('variables')).ranges, [{ tag: '@Sam', id: '42', fromIndex: 3, length: 4 }]);
});

test('rejects non-Facebook API endpoints before sending session tokens', async () => {
  let requested = false;
  const api = loadApi({
    session: { userId: '123', tokens: { fb_dtsg: 'secret-token' } },
    async request() { requested = true; return { data: '{}' }; }
  }, {
    operations: {
      sendMessage: {
        docId: 'configured-doc-id',
        endpoint: 'https://attacker.example/graphql',
        buildVariables: () => ({})
      }
    }
  });
  await assert.rejects(api.sendMessage({ threadID: 'thread-1', body: 'hello' }), {
    code: 'ERR_CONFIGURATION'
  });
  assert.equal(requested, false);
});

test('sendMessage runs the optional typing hook before its mutation', async () => {
  const { OutboundOperationQueue } = require('../src/core/outbound-queue');
  const events = [];
  const queue = new OutboundOperationQueue({
    enabled: true,
    mutationJitterMinMs: 0,
    mutationJitterMaxMs: 0,
    bucketCapacity: 10,
    refillPerSecond: 100
  }, { sleep: async () => {}, random: () => 0 });
  const client = {
    session: { userId: '123', tokens: { fb_dtsg: 'token' } },
    async request() { events.push('send'); return { data: '{"data":{"ok":true}}', status: 200 }; }
  };
  const api = loadApi(client, {
    outboundQueue: queue,
    hooks: {
      async sendTypingIndicator(event) {
        assert.deepEqual(event, { threadID: 'thread-1', state: 'typ' });
        events.push('typing');
      }
    },
    operations: {
      sendMessage: {
        docId: 'verified-doc-id',
        buildVariables: input => ({ threadID: input.threadID, body: input.body })
      }
    }
  });
  await api.sendMessage({ threadID: 'thread-1', body: 'hello', typingIndicator: true });
  assert.deepEqual(events, ['typing', 'send']);
});

test('sendMessage does not pretend to send typing without an explicit hook', async () => {
  const api = loadApi({
    session: { userId: '123', tokens: { fb_dtsg: 'token' } },
    async request() { throw new Error('request should not run'); }
  }, {
    operations: {
      sendMessage: {
        docId: 'verified-doc-id',
        buildVariables: () => ({})
      }
    }
  });
  await assert.rejects(api.sendMessage({
    threadID: 'thread-1',
    body: 'hello',
    typingIndicator: true
  }), /application-provided sendTypingIndicator hook/);
});
