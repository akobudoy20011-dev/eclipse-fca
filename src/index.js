'use strict';

const { createClient } = require('./core/client');
const { createRequestClient } = require('./core/request');
const { createProxyAgents } = require('./core/proxy');
const { loginWithAppState } = require('./core/login');
const { TokenManager, extractPageTokens } = require('./core/token-manager');
const { loadApi } = require('./core/api-loader');
const { createMqttListener, decodePayload, decodeMqttPayload, encodeThriftFrame, decodeThriftFrame, encodeLightspeedPayload, classifyLightspeedTopic } = require('./mqtt');
const { loadOperationsRegistry, mergeOperationRegistries } = require('./config/operations');
const { TYPES: THRIFT_TYPES, encodeThriftStruct, decodeThriftStruct } = require('./mqtt/thrift-binary');
const { normalizeConfig, DEFAULT_CONFIG } = require('./core/config');
const { EclipseFcaError, ConfigurationError, TransportError, StateError } = require('./core/errors');
const { MemorySessionStore } = require('./storage/memory-store');
const { FileSessionStore } = require('./storage/file-store');
const { SessionCircuitBreaker } = require('./core/circuit-breaker');
const { TokenRefreshScheduler } = require('./core/token-refresh');
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
  decodeMqttPayload,
  encodeThriftFrame,
  decodeThriftFrame,
  encodeLightspeedPayload,
  classifyLightspeedTopic,
  THRIFT_TYPES,
  encodeThriftStruct,
  decodeThriftStruct,
  loadOperationsRegistry,
  mergeOperationRegistries,
  cookies,
  createNetworkEngine,
  normalizeConfig,
  DEFAULT_CONFIG,
  MemorySessionStore,
  FileSessionStore,
  SessionCircuitBreaker,
  TokenRefreshScheduler,
  EclipseFcaError,
  ConfigurationError,
  TransportError,
  StateError
};
