'use strict';

const { EventEmitter } = require('node:events');
const { normalizeConfig } = require('./config');
const { MemorySessionStore } = require('../storage/memory-store');
const { createRequestClient } = require('./request');
const { loginWithAppState } = require('./login');
const { serializeCookies } = require('../utils/cookies');
const { isFacebookHttpsUrl } = require('../utils/url-security');
const { loadApi } = require('./api-loader');
const { createMqttListener } = require('../mqtt/client');
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
  let api = null;
  let mqttListener = null;

  function setState(next) {
    state = next;
    emitter.emit('state', next);
  }

  const client = {
    get state() { return state; },
    get config() { return config; },
    get session() {
      return session ? {
        userId: session.userId,
        tokens: { ...session.tokens },
        authenticatedAt: session.authenticatedAt
      } : null;
    },
    get api() { return api; },
    request(input) {
      const headers = { ...(input?.headers || {}) };
      const hasCookie = Object.keys(headers).some(key => key.toLowerCase() === 'cookie');
      if (session && !hasCookie && isFacebookHttpsUrl(input?.url)) {
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
      api = loadApi(client, {
        operations: options.apiOperations || {},
        hooks: options.apiHooks || {}
      });
      emitter.emit('login', { userId: session.userId });
      emitter.emit('api-ready', Object.keys(api));
      return { userId: session.userId, tokens: { ...session.tokens }, api };
    },

    listen(mqttOptions = {}) {
      if (!session) throw new StateError('Login before starting the MQTT listener.');
      if (mqttListener) return mqttListener;
      const settings = { ...(options.mqtt || {}), ...mqttOptions };
      mqttListener = createMqttListener({
        ...settings,
        session,
        network: config.network
      });
      for (const eventName of ['connect', 'subscribed', 'message', 'reconnect', 'close', 'offline', 'error']) {
        mqttListener.on(eventName, value => emitter.emit(`mqtt:${eventName}`, value));
      }
      emitter.emit('mqtt:listener-created');
      return mqttListener;
    },

    async connect() {
      if (state === 'connected') return client;
      if (connectPromise) return connectPromise;
      if (state === 'closing') throw new StateError('Cannot connect while the client is closing.');
      if (!transport || typeof transport.connect !== 'function') {
        throw new TransportError(
          'No realtime transport adapter is configured. Use client.listen() with a verified MQTT endpoint or inject a transport adapter.',
          { code: 'ERR_TRANSPORT_NOT_CONFIGURED' }
        );
      }

      connectPromise = (async () => {
        setState('connecting');
        try {
          await transport.connect({
            config, sessionStore, session,
            request: client.request.bind(client),
            requestClient,
            api,
            emit: emitter.emit.bind(emitter)
          });
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
        if (mqttListener) {
          await mqttListener.close();
          mqttListener = null;
        }
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
