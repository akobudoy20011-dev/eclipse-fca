'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createAcknowledgementDispatcher } = require('../src/mqtt/acknowledgements');

function fakeTimers() {
  const timers = [];
  return {
    timers,
    setTimeout(callback, delay) {
      const timer = { callback, delay, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimeout(timer) { timer.cleared = true; }
  };
}

test('delays opt-in delivered and read acknowledgement hooks', async () => {
  const clock = fakeTimers();
  const calls = [];
  const dispatcher = createAcknowledgementDispatcher({
    config: {
      enabled: true,
      markAsDelivered: true,
      markAsRead: true,
      minDelayMs: 100,
      maxDelayMs: 200
    },
    hooks: {
      async markAsDelivered(event) { calls.push(['delivered', event.topic]); },
      async markAsRead(event) { calls.push(['read', event.topic]); }
    },
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    random: () => 0.5
  });
  dispatcher.dispatch({ topic: '/inbox', payload: { messageId: 'm1' } });
  assert.equal(dispatcher.pendingCount, 2);
  assert.deepEqual(clock.timers.map(timer => timer.delay), [150, 150]);
  await clock.timers[0].callback();
  await clock.timers[1].callback();
  assert.deepEqual(calls, [['delivered', '/inbox'], ['read', '/inbox']]);
  assert.equal(dispatcher.pendingCount, 0);
});

test('closing acknowledgement dispatcher cancels pending callbacks', () => {
  const clock = fakeTimers();
  const dispatcher = createAcknowledgementDispatcher({
    config: { enabled: true, markAsDelivered: true },
    hooks: { markAsDelivered() {} },
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout
  });
  dispatcher.dispatch({ topic: '/inbox', payload: {} });
  dispatcher.close();
  assert.equal(clock.timers[0].cleared, true);
  assert.equal(dispatcher.pendingCount, 0);
});

test('acknowledgement hooks are explicit and required when enabled', () => {
  assert.throws(() => createAcknowledgementDispatcher({
    config: { enabled: true, markAsRead: true }
  }), { code: 'ERR_CONFIGURATION' });
});
