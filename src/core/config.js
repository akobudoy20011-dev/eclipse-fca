'use strict';

const { ConfigurationError } = require('./errors');

const DEFAULT_CONFIG = Object.freeze({
  network: Object.freeze({
    mode: 'direct',
    proxy: null,
    timeout: 30000,
    retry: Object.freeze({
      enabled: true,
      maxAttempts: 5,
      initialDelay: 1000,
      maxDelay: 30000
    })
  }),
  session: Object.freeze({
    storage: 'memory'
  }),
  diagnostics: Object.freeze({
    enabled: true
  })
});

function normalizeConfig(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ConfigurationError('Configuration must be an object.');
  }

  const networkInput = input.network ?? {};
  const retryInput = networkInput.retry ?? {};
  const sessionInput = input.session ?? {};
  const diagnosticsInput = input.diagnostics ?? {};

  if (!networkInput || typeof networkInput !== 'object' || Array.isArray(networkInput)) {
    throw new ConfigurationError('network must be an object.');
  }
  if (!retryInput || typeof retryInput !== 'object' || Array.isArray(retryInput)) {
    throw new ConfigurationError('network.retry must be an object.');
  }
  if (!sessionInput || typeof sessionInput !== 'object' || Array.isArray(sessionInput)) {
    throw new ConfigurationError('session must be an object.');
  }

  const mode = networkInput.mode ?? DEFAULT_CONFIG.network.mode;
  if (!['direct', 'proxy'].includes(mode)) {
    throw new ConfigurationError('network.mode must be "direct" or "proxy".');
  }

  const timeout = networkInput.timeout ?? DEFAULT_CONFIG.network.timeout;
  if (!Number.isInteger(timeout) || timeout <= 0) {
    throw new ConfigurationError('network.timeout must be a positive integer.');
  }

  const proxy = networkInput.proxy ?? null;
  if (mode === 'proxy' && (typeof proxy !== 'string' || proxy.trim() === '')) {
    throw new ConfigurationError('A proxy URL is required when network.mode is "proxy".');
  }
  if (mode === 'direct' && proxy !== null) {
    throw new ConfigurationError('Set network.proxy to null when network.mode is "direct".');
  }

  const maxAttempts = retryInput.maxAttempts ?? DEFAULT_CONFIG.network.retry.maxAttempts;
  const initialDelay = retryInput.initialDelay ?? DEFAULT_CONFIG.network.retry.initialDelay;
  const maxDelay = retryInput.maxDelay ?? DEFAULT_CONFIG.network.retry.maxDelay;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new ConfigurationError('network.retry.maxAttempts must be a positive integer.');
  }
  if (!Number.isInteger(initialDelay) || initialDelay < 0 ||
      !Number.isInteger(maxDelay) || maxDelay < initialDelay) {
    throw new ConfigurationError('Retry delays must be non-negative integers and maxDelay must be >= initialDelay.');
  }

  const storage = sessionInput.storage ?? DEFAULT_CONFIG.session.storage;
  if (storage !== 'memory') {
    throw new ConfigurationError('Only memory session storage is available in this foundation release.');
  }

  return Object.freeze({
    network: Object.freeze({
      mode,
      proxy,
      timeout,
      retry: Object.freeze({
        enabled: retryInput.enabled ?? DEFAULT_CONFIG.network.retry.enabled,
        maxAttempts,
        initialDelay,
        maxDelay
      })
    }),
    session: Object.freeze({ storage }),
    diagnostics: Object.freeze({
      enabled: diagnosticsInput.enabled ?? DEFAULT_CONFIG.diagnostics.enabled
    })
  });
}

module.exports = { DEFAULT_CONFIG, normalizeConfig };
