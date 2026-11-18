'use strict';

const { EventEmitter } = require('node:events');
const { normalizeConfig } = require('./config');
const { MemorySessionStore } = require('../storage/memory-store');
const { StateError, TransportError } = require('./errors');

function createClient(options = {}) {
  const config = normalizeConfig(options);
  const transport = options.transport ?? null;
  const sessionStore = options.sessionStore ?? new MemorySessionStore();
  const emitter = new EventEmitter();
  let state = 'idle';
  let connectPromise = null;

  function setState(next) {
    state = next;
    emitter.emit('state', next);
  }

  const client = {
    get state() {
      return state;
    },
    get config() {
      return config;
    },
    get sessionStore() {
      return sessionStore;
    },
    on: emitter.on.bind(emitter),
    once: emitter.once.bind(emitter),
    off: emitter.off.bind(emitter),
    emit: emitter.emit.bind(emitter),

    async connect() {
      if (state === 'connected') return client;
      if (connectPromise) return connectPromise;
      if (state === 'closing') {
        throw new StateError('Cannot connect while the client is closing.');
      }
      if (!transport || typeof transport.connect !== 'function') {
        throw new TransportError(
          'No transport adapter is configured. Messenger connectivity is not included in the foundation release.',
          { code: 'ERR_TRANSPORT_NOT_CONFIGURED' }
        );
      }

      connectPromise = (async () => {
        setState('connecting');
        try {
          await transport.connect({ config, sessionStore, emit: emitter.emit.bind(emitter) });
          setState('connected');
          emitter.emit('connected');
          return client;
        } catch (cause) {
          setState('error');
          const error = cause instanceof Error
            ? new TransportError('Transport connection failed.', { cause })
            : new TransportError('Transport connection failed.');
          emitter.emit('error', error);
          throw error;
        } finally {
          connectPromise = null;
        }
      })();

      return connectPromise;
    },

    async disconnect() {
      if (state === 'idle' || state === 'disconnected') return;
      if (state === 'closing') return;
      setState('closing');
      try {
        if (transport && typeof transport.disconnect === 'function') {
          await transport.disconnect();
        }
      } finally {
        setState('disconnected');
        emitter.emit('disconnected');
      }
    }
  };

  return client;
}

module.exports = { createClient };
