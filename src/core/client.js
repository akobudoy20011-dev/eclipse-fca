'use strict';

const { EventEmitter } = require('node:events');
const { normalizeConfig } = require('./config');
const { MemorySessionStore } = require('../storage/memory-store');
const { createRequestClient } = require('./request');
const { loginWithAppState } = require('./login');
const { serializeCookies } = require('../utils/cookies');
const { StateError, TransportError } = require('./errors');

function createClient(options = {}) {
  const config = normalizeConfig(options);
  const transport = options.transport ?? null;
  const sessionStore = options.sessionStore ?? new MemorySessionStore();
  const requestClient = options.requestClient ?? createRequestClient(config, options.http || {});
  const emitter = new EventEmitter();
  let state = 'idle';
  let connectPromise = null;
  let session = null;

  function setState(next) {
    state = next;
    emitter.emit('state', next);
  }

  const client = {
    get state() { return state; },
    get config() { return config; },
    get sessionStore() { return sessionStore; },
    get session() { return session ? { userId: session.userId, tokens: { ...session.tokens }, authenticatedAt: session.authenticatedAt } : null; },
    request(input) {
      const headers = { ...(input?.headers || {}) };
      if (session && !Object.keys(headers).some(key => key.toLowerCase() === 'cookie')) {
        headers.cookie = serializeCookies(session.cookies);
      }
      return requestClient.request({ ...input, headers });
    },

    on: emitter.on.bind(emitter),
    once: emitter.once.bind(emitter),
    off: emitter.off.bind(emitter),
    emit: emitter.emit.bind(emitter),

    async login(appState, loginOptions = {}) {
      if (state === 'connecting' || state === 'connected' || state === 'closing') {
        throw new StateError('Cannot replace the session while the client is active.');
      }
      session = await loginWithAppState({
        appState,
        requestClient,
        sessionStore,
        sessionKey: loginOptions.sessionKey || 'default',
        homeUrl: loginOptions.homeUrl
      });
      emitter.emit('login', { userId: session.userId });
      return { userId: session.userId, tokens: { ...session.tokens } };
    },

    async connect() {
      if (state === 'connected') return client;
      if (connectPromise) return connectPromise;
      if (state === 'closing') {
        throw new StateError('Cannot connect while the client is closing.');
      }
      if (!transport || typeof transport.connect !== 'function') {
        throw new TransportError(
          'No realtime transport adapter is configured. Messenger realtime connectivity is not included in this release.',
          { code: 'ERR_TRANSPORT_NOT_CONFIGURED' }
        );
      }

      connectPromise = (async () => {
        setState('connecting');
        try {
          await transport.connect({ config, sessionStore, session, request: client.request.bind(client), requestClient, emit: emitter.emit.bind(emitter) });
          setState('connected');
          emitter.emit('connected');
          return client;
        } catch (cause) {
          setState('error');
          const error = new TransportError('Transport connection failed.', { cause });
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
        if (transport && typeof transport.disconnect === 'function') await transport.disconnect();
      } finally {
        setState('disconnected');
        emitter.emit('disconnected');
      }
    }
  };

  return client;
}

module.exports = { createClient };
