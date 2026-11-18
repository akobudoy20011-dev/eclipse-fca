'use strict';

const { createClient } = require('./core/client');
const { normalizeConfig, DEFAULT_CONFIG } = require('./core/config');
const { EclipseFcaError, ConfigurationError, TransportError, StateError } = require('./core/errors');
const { MemorySessionStore } = require('./storage/memory-store');

module.exports = {
  createClient,
  normalizeConfig,
  DEFAULT_CONFIG,
  MemorySessionStore,
  EclipseFcaError,
  ConfigurationError,
  TransportError,
  StateError
};
