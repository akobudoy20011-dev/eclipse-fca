'use strict';

const { createClient } = require('./core/client');
const { createRequestClient } = require('./core/request');
const { createProxyAgents } = require('./core/proxy');
const { loginWithAppState } = require('./core/login');
const { TokenManager, extractPageTokens } = require('./core/token-manager');
const { loadApi } = require('./core/api-loader');
const { createMqttListener, decodePayload } = require('./mqtt');
const { normalizeConfig, DEFAULT_CONFIG } = require('./core/config');
const { EclipseFcaError, ConfigurationError, TransportError, StateError } = require('./core/errors');
const { MemorySessionStore } = require('./storage/memory-store');
const { createNetworkEngine } = require('./network/engine');
const cookies = require('./utils/cookies');

module.exports = {
  createClient,
  createRequestClient,
  createProxyAgents,
  loginWithAppState,
  TokenManager,
  extractPageTokens,
  loadApi,
  createMqttListener,
  decodePayload,
  cookies,
  createNetworkEngine,
  normalizeConfig,
  DEFAULT_CONFIG,
  MemorySessionStore,
  EclipseFcaError,
  ConfigurationError,
  TransportError,
  StateError
};
