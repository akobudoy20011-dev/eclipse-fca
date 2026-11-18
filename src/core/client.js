'use strict';

const { EventEmitter } = require('node:events');
const { normalizeConfig } = require('./config');
const { MemorySessionStore } = require('../storage/memory-store');
const { createRequestClient } = require('./request');
const { loginWithAppState } = require('./login');
const { serializeCookies, mergeSetCookie } = require('../utils/cookies');
const { isFacebookHttpsUrl } = require('../utils/url-security');
const { loadApi } = require('./api-loader');
const { createMqttListener } = require('../mqtt/client');
const { SessionManager, responseExpiryReason } = require('./session-manager');
const { TokenRefreshScheduler } = require('./token-refresh');
const { TokenManager } = require('./token-manager');
const { StateError, TransportError } = require('./errors');

function redactProxyUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.username) url.username = '[redacted]';
    if (url.password) url.password = '[redacted]';
    return url.toString();
  } catch {
    return '[configured]';
  }
}

function createClient(options = {}) {
  const config = normalizeConfig(options);
  const publicConfig = Object.freeze({
    ...config,
    network: Object.freeze({ ...config.network, proxy: redactProxyUrl(config.network.proxy) })
  });
  const transport = options.transport ?? null;
  const sessionStore = options.sessionStore ?? new MemorySessionStore();
  const requestClient = options.requestClient ?? createRequestClient(config, options.http || {});
  const emitter = new EventEmitter();
  let state = 'idle';
  let connectPromise = null;
  let sessionManager = null;
  let refreshScheduler = null;
  let api = null;
  let mqttListener = null;

  function setState(next) {
    state = next;
    emitter.emit('state', next);
  }

  async function stopRealtimeForExpiry() {
    if (refreshScheduler) refreshScheduler.stop();
    if (mqttListener) {
      const listener = mqttListener;
      mqttListener = null;
      await Promise.resolve().then(() => listener.close()).catch(() => {});
    }
    if (transport && typeof transport.disconnect === 'function') {
      await Promise.resolve().then(() => transport.disconnect()).catch(() => {});
    }
    setState('invalidated');
  }

  function createManager(sessionKey) {
    return new SessionManager({
      sessionStore,
      sessionKey,
      refreshProvider: async current => {
        const response = await requestClient.request({
          method: 'GET',
          url: options.session?.refreshUrl || 'https://www.facebook.com/',
          headers: { cookie: sessionManager.getCookieHeader() },
          responseType: 'text'
        });
        const expiry = responseExpiryReason(response);
        if (expiry) {
          await sessionManager.invalidate(expiry);
          throw new StateError('Session was rejected during token refresh.', { code: 'ERR_SESSION_INVALIDATED' });
        }
        const tokenManager = new TokenManager();
        tokenManager.updateFromHtml(typeof response.data === 'string' ? response.data : '');
        const extracted = tokenManager.snapshot();
        const cookies = mergeSetCookie(sessionManager.getCookiesForRefresh(), response.headers?.['set-cookie']);
        const userCookie = cookies.find(cookie => cookie.key === 'c_user')?.value;
        if (!userCookie || userCookie !== current.userId || !extracted.fb_dtsg) {
          throw new StateError('Session token refresh could not verify the existing account.', {
            code: 'ERR_TOKEN_REFRESH_INVALID'
          });
        }
        return {
          userId: current.userId,
          cookies,
          tokens: {
            ...current.tokens,
            fb_dtsg: extracted.fb_dtsg,
            lsd: extracted.lsd || current.tokens.lsd,
            jazoest: extracted.jazoest || current.tokens.jazoest,
            userId: current.userId
          }
        };
      },
      onExpired: async event => {
        await stopRealtimeForExpiry();
        emitter.emit('session_expired', event);
      }
    });
  }

  const client = {
    get state() { return state; },
    get config() { return publicConfig; },
    get session() {
      const current = sessionManager?.snapshot();
      return current ? {
        userId: current.userId,
        tokens: { ...current.tokens },
        authenticatedAt: current.authenticatedAt,
        invalidated: Boolean(current.invalidated)
      } : null;
    },
    get api() { return api; },
    request: async function request(input) {
      if (sessionManager) await sessionManager.waitForRefresh();
      const headers = { ...(input?.headers || {}) };
      const hasCookie = Object.keys(headers).some(key => key.toLowerCase() === 'cookie');
      if (sessionManager && !hasCookie && isFacebookHttpsUrl(input?.url)) {
        headers.cookie = sessionManager.getCookieHeader();
      }
      const response = await requestClient.request({ ...input, headers });
      if (sessionManager) await sessionManager.handleResponse(response);
      return response;
    },

    on: emitter.on.bind(emitter),
    once: emitter.once.bind(emitter),
    off: emitter.off.bind(emitter),
    emit: emitter.emit.bind(emitter),

    async login(appState, loginOptions = {}) {
      if (state === 'connecting' || state === 'connected' || state === 'closing') {
        throw new StateError('Cannot replace the session while the client is active.');
      }
      if (refreshScheduler) refreshScheduler.stop();
      if (mqttListener) {
        await Promise.resolve().then(() => mqttListener.close()).catch(() => {});
        mqttListener = null;
      }
      const sessionKey = loginOptions.sessionKey || 'default';
      const initialSession = await loginWithAppState({
        appState, requestClient, sessionStore, sessionKey, homeUrl: loginOptions.homeUrl
      });
      sessionManager = createManager(sessionKey);
      await sessionManager.setSession(initialSession);
      api = loadApi(client, {
        operations: options.apiOperations || {},
        hooks: options.apiHooks || {}
      });
      const refreshOptions = options.session?.refresh || {};
      refreshScheduler = new TokenRefreshScheduler({
        sessionManager,
        baseIntervalMs: refreshOptions.intervalMs ?? 45 * 60 * 1000,
        jitterMs: refreshOptions.jitterMs ?? 5 * 60 * 1000,
        onError: event => emitter.emit('token_refresh_error', event)
      });
      refreshScheduler.start();
      emitter.emit('login', { userId: initialSession.userId });
      emitter.emit('api-ready', Object.keys(api));
      return { userId: initialSession.userId, tokens: { ...initialSession.tokens }, api };
    },

    listen(mqttOptions = {}) {
      if (!sessionManager) throw new StateError('Login before starting the MQTT listener.');
      sessionManager.assertUsable();
      if (mqttListener) return mqttListener;
      const settings = { ...(options.mqtt || {}), ...mqttOptions };
      mqttListener = createMqttListener({
        ...settings,
        session: { userId: sessionManager.snapshot().userId, cookies: sessionManager.getCookiesForRefresh() },
        network: config.network,
        onSessionExpired: reason => sessionManager.invalidate(reason)
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
      if (sessionManager) sessionManager.assertUsable();
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
            config, sessionStore,
            session: sessionManager?.snapshot(),
            request: client.request.bind(client),
            requestClient, api, emit: emitter.emit.bind(emitter)
          });
          setState('connected');
          emitter.emit('connected');
          return client;
        } catch (cause) {
          setState('error');
          const error = new TransportError('Transport connection failed.', {
            code: 'ERR_TRANSPORT',
            details: { transportCode: typeof cause?.code === 'string' ? cause.code : undefined }
          });
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
      if (refreshScheduler) refreshScheduler.stop();
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
