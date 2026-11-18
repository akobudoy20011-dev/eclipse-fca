'use strict';

const { StateError, ConfigurationError } = require('./errors');

const DEFAULTS = Object.freeze({
  enabled: true,
  mutationJitterMinMs: 400,
  mutationJitterMaxMs: 1600,
  bucketCapacity: 5,
  refillPerSecond: 1
});

class OutboundOperationQueue {
  constructor(options = {}, runtime = {}) {
    this.options = { ...DEFAULTS, ...options };
    this.now = runtime.now || Date.now;
    this.sleep = runtime.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
    this.random = runtime.random || Math.random;
    this.buckets = new Map();
    this.tails = new Map();
    this.closed = false;
    this.validate();
  }

  validate() {
    const o = this.options;
    if (typeof o.enabled !== 'boolean' ||
        !Number.isInteger(o.mutationJitterMinMs) || o.mutationJitterMinMs < 0 ||
        !Number.isInteger(o.mutationJitterMaxMs) || o.mutationJitterMaxMs < o.mutationJitterMinMs ||
        !Number.isInteger(o.bucketCapacity) || o.bucketCapacity < 1 ||
        typeof o.refillPerSecond !== 'number' || !Number.isFinite(o.refillPerSecond) || o.refillPerSecond <= 0) {
      throw new ConfigurationError('Invalid outbound pacing configuration.');
    }
  }

  reserve(bucketKey) {
    const now = this.now();
    const rate = this.options.refillPerSecond / 1000;
    let bucket = this.buckets.get(bucketKey);
    if (!bucket) {
      bucket = { tokens: this.options.bucketCapacity, updatedAt: now };
      this.buckets.set(bucketKey, bucket);
    }
    const elapsed = Math.max(0, now - bucket.updatedAt);
    bucket.tokens = Math.min(this.options.bucketCapacity, bucket.tokens + elapsed * rate);
    bucket.updatedAt = Math.max(now, bucket.updatedAt);
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return 0;
    }
    const waitMs = Math.ceil((1 - bucket.tokens) / rate);
    bucket.tokens = 0;
    bucket.updatedAt += waitMs;
    return waitMs;
  }

  async run({ endpoint, threadId }, task) {
    if (typeof task !== 'function') throw new TypeError('Outbound queue task must be a function.');
    if (this.closed) throw new StateError('Outbound operation queue is closed.');
    if (!this.options.enabled) return task();
    const endpointKey = String(endpoint || 'default');
    const threadKey = String(threadId || 'global');
    const queueKey = endpointKey + '\u0000' + threadKey;
    const previous = this.tails.get(queueKey) || Promise.resolve();
    let release;
    const tail = new Promise(resolve => { release = resolve; });
    this.tails.set(queueKey, tail);
    await previous.catch(() => {});
    try {
      if (this.closed) throw new StateError('Outbound operation queue is closed.');
      const endpointWait = this.reserve('endpoint:' + endpointKey);
      const threadWait = this.reserve('thread:' + threadKey);
      const jitterRange = this.options.mutationJitterMaxMs - this.options.mutationJitterMinMs;
      const jitter = this.options.mutationJitterMinMs + Math.floor(this.random() * (jitterRange + 1));
      await this.sleep(Math.max(endpointWait, threadWait) + jitter);
      if (this.closed) throw new StateError('Outbound operation queue is closed.');
      return await task();
    } finally {
      release();
      if (this.tails.get(queueKey) === tail) this.tails.delete(queueKey);
    }
  }

  close() {
    this.closed = true;
    this.tails.clear();
  }
}

module.exports = { OutboundOperationQueue, DEFAULT_OUTBOUND_PACING: DEFAULTS };
