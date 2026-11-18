'use strict';

const { ConfigurationError } = require('../core/errors');

function createAcknowledgementDispatcher(options = {}) {
  const config = {
    enabled: false,
    markAsDelivered: false,
    markAsRead: false,
    minDelayMs: 500,
    maxDelayMs: 1500,
    ...options.config
  };
  const hooks = options.hooks || {};
  const setTimer = options.setTimeout || setTimeout;
  const clearTimer = options.clearTimeout || clearTimeout;
  const random = options.random || Math.random;
  const timers = new Set();
  let closed = false;

  if (typeof config.enabled !== 'boolean' ||
      typeof config.markAsDelivered !== 'boolean' ||
      typeof config.markAsRead !== 'boolean' ||
      !Number.isInteger(config.minDelayMs) || config.minDelayMs < 0 ||
      !Number.isInteger(config.maxDelayMs) || config.maxDelayMs < config.minDelayMs) {
    throw new ConfigurationError('Invalid MQTT acknowledgement pacing configuration.');
  }
  if (config.enabled && config.markAsDelivered && typeof hooks.markAsDelivered !== 'function') {
    throw new ConfigurationError('markAsDelivered requires an application-provided acknowledgement hook.');
  }
  if (config.enabled && config.markAsRead && typeof hooks.markAsRead !== 'function') {
    throw new ConfigurationError('markAsRead requires an application-provided acknowledgement hook.');
  }

  function schedule(kind, hook, event) {
    const span = config.maxDelayMs - config.minDelayMs;
    const delay = config.minDelayMs + Math.floor(random() * (span + 1));
    const timer = setTimer(async () => {
      timers.delete(timer);
      if (closed) return;
      try {
        await hook(event);
      } catch {
        if (typeof options.onError === 'function') {
          try { options.onError({ code: 'ERR_MQTT_ACKNOWLEDGEMENT', kind }); } catch {}
        }
      }
    }, delay);
    timers.add(timer);
  }

  return Object.freeze({
    dispatch(event) {
      if (closed || !config.enabled) return;
      if (config.markAsDelivered) schedule('delivered', hooks.markAsDelivered, event);
      if (config.markAsRead) schedule('read', hooks.markAsRead, event);
    },
    close() {
      closed = true;
      for (const timer of timers) clearTimer(timer);
      timers.clear();
    },
    get pendingCount() { return timers.size; }
  });
}

module.exports = { createAcknowledgementDispatcher };
