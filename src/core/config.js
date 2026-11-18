'use strict';

const { ConfigurationError } = require('./errors');
const { DEFAULT_BROWSER_PROFILE } = require('../utils/browser-profile');

const DEFAULT_PACING = Object.freeze({
  enabled: true,
  mutationJitterMinMs: 400,
  mutationJitterMaxMs: 1600,
  bucketCapacity: 5,
  refillPerSecond: 1
});

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
    storage: 'memory',
    directory: null
  }),
  browserProfile: DEFAULT_BROWSER_PROFILE,
  pacing: DEFAULT_PACING,
  diagnostics: Object.freeze({ enabled: true })
});

function normalizeConfig(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ConfigurationError('Configuration must be an object.');
  }
  const networkInput = input.network ?? {};
  const retryInput = networkInput.retry ?? {};
  const sessionInput = input.session ?? {};
  const browserInput = input.browserProfile ?? {};
  const pacingInput = input.pacing ?? {};
  const diagnosticsInput = input.diagnostics ?? {};
  for (const [name, value] of Object.entries({
    network: networkInput, 'network.retry': retryInput, session: sessionInput,
    browserProfile: browserInput, pacing: pacingInput, diagnostics: diagnosticsInput
  })) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new ConfigurationError(name + ' must be an object.');
    }
  }

  const mode = networkInput.mode ?? DEFAULT_CONFIG.network.mode;
  if (!['direct', 'proxy'].includes(mode)) throw new ConfigurationError('network.mode must be "direct" or "proxy".');
  const timeout = networkInput.timeout ?? DEFAULT_CONFIG.network.timeout;
  if (!Number.isInteger(timeout) || timeout <= 0) throw new ConfigurationError('network.timeout must be a positive integer.');
  const proxy = networkInput.proxy ?? null;
  if (mode === 'proxy' && (typeof proxy !== 'string' || !proxy.trim())) {
    throw new ConfigurationError('A proxy URL is required when network.mode is "proxy".');
  }
  if (mode === 'direct' && proxy !== null) throw new ConfigurationError('Set network.proxy to null when network.mode is "direct".');

  const maxAttempts = retryInput.maxAttempts ?? DEFAULT_CONFIG.network.retry.maxAttempts;
  const initialDelay = retryInput.initialDelay ?? DEFAULT_CONFIG.network.retry.initialDelay;
  const maxDelay = retryInput.maxDelay ?? DEFAULT_CONFIG.network.retry.maxDelay;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) throw new ConfigurationError('network.retry.maxAttempts must be a positive integer.');
  if (!Number.isInteger(initialDelay) || initialDelay < 0 || !Number.isInteger(maxDelay) || maxDelay < initialDelay) {
    throw new ConfigurationError('Retry delays must be non-negative integers and maxDelay must be >= initialDelay.');
  }

  const storage = sessionInput.storage ?? DEFAULT_CONFIG.session.storage;
  const directory = sessionInput.directory ?? null;
  if (!['memory', 'file'].includes(storage)) throw new ConfigurationError('session.storage must be "memory" or "file".');
  if (storage === 'file' && (typeof directory !== 'string' || !directory.trim())) {
    throw new ConfigurationError('session.directory is required when session.storage is "file".');
  }
  if (storage === 'memory' && directory !== null) {
    throw new ConfigurationError('session.directory must be null when session.storage is "memory".');
  }

  const browserProfile = {};
  for (const key of Object.keys(DEFAULT_BROWSER_PROFILE)) {
    const value = browserInput[key] ?? DEFAULT_BROWSER_PROFILE[key];
    if (typeof value !== 'string' || !value.trim() || /[\r\n]/.test(value)) {
      throw new ConfigurationError('browserProfile.' + key + ' must be a non-empty header-safe string.');
    }
    browserProfile[key] = value;
  }

  const pacing = { ...DEFAULT_PACING, ...pacingInput };
  if (typeof pacing.enabled !== 'boolean' ||
      !Number.isInteger(pacing.mutationJitterMinMs) || pacing.mutationJitterMinMs < 0 ||
      !Number.isInteger(pacing.mutationJitterMaxMs) || pacing.mutationJitterMaxMs < pacing.mutationJitterMinMs ||
      !Number.isInteger(pacing.bucketCapacity) || pacing.bucketCapacity < 1 ||
      typeof pacing.refillPerSecond !== 'number' || !Number.isFinite(pacing.refillPerSecond) || pacing.refillPerSecond <= 0) {
    throw new ConfigurationError('Invalid pacing configuration.');
  }

  return Object.freeze({
    network: Object.freeze({
      mode, proxy, timeout,
      retry: Object.freeze({
        enabled: retryInput.enabled ?? DEFAULT_CONFIG.network.retry.enabled,
        maxAttempts, initialDelay, maxDelay
      })
    }),
    session: Object.freeze({ storage, directory }),
    browserProfile: Object.freeze(browserProfile),
    pacing: Object.freeze(pacing),
    diagnostics: Object.freeze({ enabled: diagnosticsInput.enabled ?? DEFAULT_CONFIG.diagnostics.enabled })
  });
}

module.exports = { DEFAULT_CONFIG, DEFAULT_PACING, normalizeConfig };
