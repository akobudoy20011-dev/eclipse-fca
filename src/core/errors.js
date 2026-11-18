'use strict';

class EclipseFcaError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = new.target.name;
    this.code = options.code || 'ECLIPSE_FCA_ERROR';
    if (options.details !== undefined) this.details = options.details;
  }
}

class ConfigurationError extends EclipseFcaError {
  constructor(message, options = {}) {
    super(message, { ...options, code: options.code || 'ERR_CONFIGURATION' });
  }
}

class TransportError extends EclipseFcaError {
  constructor(message, options = {}) {
    super(message, { ...options, code: options.code || 'ERR_TRANSPORT' });
  }
}

class StateError extends EclipseFcaError {
  constructor(message, options = {}) {
    super(message, { ...options, code: options.code || 'ERR_STATE' });
  }
}

module.exports = { EclipseFcaError, ConfigurationError, TransportError, StateError };
