'use strict';

const { TransportError, ConfigurationError } = require('../core/errors');
const { normalizeConfig } = require('../core/config');

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function retryAfterMs(response, now = Date.now()) {
  const value = response.headers && response.headers.get('retry-after');
  if (!value) return null;
  if (/^\d+(?:\.\d+)?$/.test(value.trim())) return Math.max(0, Number(value) * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : null;
}

function abortError() {
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

function createNetworkEngine(options = {}) {
  const config = normalizeConfig(options);
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const proxyAdapter = options.proxyAdapter ?? null;
  const realtimeFactory = options.realtimeFactory ?? null;

  if (config.network.mode === 'direct' && typeof fetchImpl !== 'function') {
    throw new ConfigurationError('A Fetch-compatible implementation is required for direct networking.');
  }
  if (config.network.mode === 'proxy' &&
      (!proxyAdapter || typeof proxyAdapter.fetch !== 'function')) {
    throw new ConfigurationError('Proxy mode requires an explicit proxyAdapter.fetch implementation.');
  }

  const dispatch = config.network.mode === 'proxy'
    ? proxyAdapter.fetch.bind(proxyAdapter)
    : fetchImpl;

  async function request(input, init = {}) {
    const method = String(init.method ?? 'GET').toUpperCase();
    const headers = new Headers(init.headers ?? {});
    const explicitlyIdempotent = headers.has('idempotency-key') || headers.has('Idempotency-Key');
    const retryableMethod = SAFE_METHODS.has(method) || explicitlyIdempotent;
    const retry = config.network.retry;
    const maxAttempts = retry.enabled && retryableMethod ? retry.maxAttempts : 1;
    let lastError;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (init.signal?.aborted) throw abortError();
      const controller = new AbortController();
      const onAbort = () => controller.abort(init.signal.reason);
      init.signal?.addEventListener('abort', onAbort, { once: true });
      const timeout = setTimeout(() => controller.abort(new Error('Request timed out.')), config.network.timeout);
      let response;

      try {
        response = await dispatch(input, { ...init, method, headers, signal: controller.signal });
        if (!RETRYABLE_STATUS.has(response.status) || attempt === maxAttempts) return response;
        const delay = Math.min(
          retry.maxDelay,
          retryAfterMs(response) ?? Math.min(retry.maxDelay, retry.initialDelay * (2 ** (attempt - 1)))
        );
        if (typeof response.body?.cancel === 'function') await response.body.cancel().catch(() => {});
        clearTimeout(timeout);
        init.signal?.removeEventListener('abort', onAbort);
        await new Promise(resolve => setTimeout(resolve, delay));
      } catch (cause) {
        lastError = cause;
        if (init.signal?.aborted) throw abortError();
        if (attempt === maxAttempts) {
          const timedOut = controller.signal.aborted;
          throw new TransportError(
            timedOut ? 'Network request timed out.' : 'Network request failed.',
            { code: timedOut ? 'ERR_NETWORK_TIMEOUT' : 'ERR_NETWORK_REQUEST', cause }
          );
        }
        clearTimeout(timeout);
        init.signal?.removeEventListener('abort', onAbort);
        const delay = Math.min(retry.maxDelay, retry.initialDelay * (2 ** (attempt - 1)));
        await new Promise(resolve => setTimeout(resolve, delay));
      } finally {
        clearTimeout(timeout);
        init.signal?.removeEventListener('abort', onAbort);
      }
    }
    throw new TransportError('Network request failed.', { code: 'ERR_NETWORK_REQUEST', cause: lastError });
  }

  function openRealtime(url, protocols) {
    if (typeof realtimeFactory !== 'function') {
      throw new TransportError('No realtime adapter is configured.', { code: 'ERR_REALTIME_NOT_CONFIGURED' });
    }
    return realtimeFactory(url, protocols, {
      mode: config.network.mode,
      proxy: config.network.mode === 'proxy' ? config.network.proxy : null
    });
  }

  function diagnostics() {
    return Object.freeze({
      mode: config.network.mode,
      timeout: config.network.timeout,
      retriesEnabled: config.network.retry.enabled,
      maxAttempts: config.network.retry.maxAttempts,
      realtimeConfigured: typeof realtimeFactory === 'function'
    });
  }

  return Object.freeze({ request, openRealtime, diagnostics });
}

module.exports = { createNetworkEngine, RETRYABLE_STATUS, SAFE_METHODS };
