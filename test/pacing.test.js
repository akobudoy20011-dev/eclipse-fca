'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { OutboundOperationQueue } = require('../src/core/outbound-queue');

test('outbound queue applies endpoint and per-thread token buckets plus jitter', async () => {
  let now = 0;
  const delays = [];
  const queue = new OutboundOperationQueue({
    enabled: true,
    mutationJitterMinMs: 400,
    mutationJitterMaxMs: 400,
    bucketCapacity: 1,
    refillPerSecond: 1
  }, {
    now: () => now,
    random: () => 0,
    sleep: async ms => { delays.push(ms); now += ms; }
  });
  await queue.run({ endpoint: 'https://www.facebook.com/graphql', threadId: 'thread-a' }, async () => 'one');
  await queue.run({ endpoint: 'https://www.facebook.com/graphql', threadId: 'thread-a' }, async () => 'two');
  assert.deepEqual(delays, [400, 1000]);
});

test('outbound queue serializes mutations for the same endpoint and thread', async () => {
  const order = [];
  const queue = new OutboundOperationQueue({
    mutationJitterMinMs: 0,
    mutationJitterMaxMs: 0,
    bucketCapacity: 10,
    refillPerSecond: 100
  }, { sleep: async () => {}, random: () => 0 });
  await Promise.all([
    queue.run({ endpoint: 'endpoint', threadId: 'thread' }, async () => { order.push('first-start'); await Promise.resolve(); order.push('first-end'); }),
    queue.run({ endpoint: 'endpoint', threadId: 'thread' }, async () => { order.push('second-start'); order.push('second-end'); })
  ]);
  assert.deepEqual(order, ['first-start', 'first-end', 'second-start', 'second-end']);
});

test('closed outbound queue rejects work', async () => {
  const queue = new OutboundOperationQueue();
  queue.close();
  await assert.rejects(queue.run({ endpoint: 'e', threadId: 't' }, async () => {}), {
    code: 'ERR_STATE'
  });
});
