'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { ConfigurationError } = require('../core/errors');

const DEFAULT_REGISTRY_PATH = path.join(__dirname, 'operations.json');
const ALLOWED_KEYS = new Set(['doc_id', 'endpoint', 'friendly_name', 'mutation', 'variables', 'input_schema']);
const ALLOWED_SCHEMA_TYPES = new Set(['string', 'number', 'integer', 'boolean', 'array', 'object']);

function resolveTemplate(value, input, session) {
  if (Array.isArray(value)) return value.map(item => resolveTemplate(item, input, session));
  if (!value || typeof value !== 'object') return value;
  const keys = Object.keys(value);
  if (keys.length === 1 && keys[0] === '$input') {
    const key = value.$input;
    if (typeof key !== 'string' || !key || !Object.prototype.hasOwnProperty.call(input, key)) {
      throw new ConfigurationError('Operation registry references a missing input variable.');
    }
    return input[key];
  }
  if (keys.length === 1 && keys[0] === '$inputOptional') {
    const key = value.$inputOptional;
    if (typeof key !== 'string' || !key) throw new ConfigurationError('Invalid optional input reference in operation registry.');
    return Object.prototype.hasOwnProperty.call(input, key) ? input[key] : null;
  }
  if (keys.length === 1 && keys[0] === '$session') {
    const key = value.$session;
    if (typeof key !== 'string' || !key || !Object.prototype.hasOwnProperty.call(session || {}, key)) {
      throw new ConfigurationError('Operation registry references a missing session variable.');
    }
    return session[key];
  }
  const result = {};
  for (const [key, nested] of Object.entries(value)) {
    result[key] = resolveTemplate(nested, input, session);
  }
  return result;
}

function validateInputSchema(schema, input, operationName) {
  if (!schema) return;
  if (!schema || schema.type !== 'object' || !schema.properties ||
      typeof schema.properties !== 'object' || Array.isArray(schema.properties) ||
      (schema.required !== undefined && (!Array.isArray(schema.required) ||
        schema.required.some(key => typeof key !== 'string'))) ||
      (schema.additionalProperties !== undefined && typeof schema.additionalProperties !== 'boolean')) {
    throw new ConfigurationError('Operation registry input_schema for "' + operationName + '" is invalid.');
  }
  for (const [key, property] of Object.entries(schema.properties)) {
    if (!property || typeof property !== 'object' || !ALLOWED_SCHEMA_TYPES.has(property.type) ||
        (property.nullable !== undefined && typeof property.nullable !== 'boolean')) {
      throw new ConfigurationError('Operation registry input_schema property is invalid.');
    }
    if (Object.keys(property).some(field => !['type', 'nullable'].includes(field))) {
      throw new ConfigurationError('Unsupported operation registry input_schema property constraint.');
    }
  }
  for (const key of schema.required || []) {
    if (!Object.prototype.hasOwnProperty.call(schema.properties, key)) {
      throw new ConfigurationError('Operation registry required input is not declared in properties.');
    }
    if (!Object.prototype.hasOwnProperty.call(input, key)) {
      throw new ConfigurationError('Operation "' + operationName + '" is missing a required input field.');
    }
  }
  if (schema.additionalProperties === false) {
    for (const key of Object.keys(input)) {
      if (!Object.prototype.hasOwnProperty.call(schema.properties, key)) {
        throw new ConfigurationError('Operation "' + operationName + '" received an unsupported input field.');
      }
    }
  }
  for (const [key, value] of Object.entries(input)) {
    const property = schema.properties[key];
    if (!property) continue;
    if (value === null && property.nullable) continue;
    const actual = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
    const valid = property.type === 'integer'
      ? Number.isInteger(value)
      : actual === property.type;
    if (!valid) throw new ConfigurationError('Operation "' + operationName + '" input field "' + key + '" has an invalid type.');
  }
}

function normalizeDescriptor(name, descriptor) {
  if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)) {
    throw new ConfigurationError('Operation registry descriptor "' + name + '" must be an object.');
  }
  for (const key of Object.keys(descriptor)) {
    if (!ALLOWED_KEYS.has(key)) throw new ConfigurationError('Unknown field in operation registry descriptor "' + name + '".');
  }
  if (descriptor.doc_id !== null && descriptor.doc_id !== undefined &&
      (typeof descriptor.doc_id !== 'string' || !descriptor.doc_id.trim())) {
    throw new ConfigurationError('Operation registry doc_id must be a non-empty string or null.');
  }
  if (descriptor.endpoint !== undefined && typeof descriptor.endpoint !== 'string') {
    throw new ConfigurationError('Operation registry endpoint must be a string.');
  }
  if (descriptor.friendly_name !== undefined && typeof descriptor.friendly_name !== 'string') {
    throw new ConfigurationError('Operation registry friendly_name must be a string.');
  }
  if (descriptor.mutation !== undefined && typeof descriptor.mutation !== 'boolean') {
    throw new ConfigurationError('Operation registry mutation must be a boolean.');
  }
  if (!descriptor.variables || typeof descriptor.variables !== 'object' || Array.isArray(descriptor.variables)) {
    throw new ConfigurationError('Operation registry variables must be an object template.');
  }
  return Object.freeze({
    docId: descriptor.doc_id ?? null,
    endpoint: descriptor.endpoint,
    friendlyName: descriptor.friendly_name,
    mutation: descriptor.mutation,
    buildVariables(input, session) {
      if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new ConfigurationError('Operation input must be an object.');
      }
      validateInputSchema(descriptor.input_schema, input, name);
      return resolveTemplate(descriptor.variables, input, session);
    }
  });
}

function loadOperationsRegistry(options = {}) {
  const registryPath = options.path || DEFAULT_REGISTRY_PATH;
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  } catch (error) {
    throw new ConfigurationError('Unable to load the operation registry.', {
      code: 'ERR_OPERATION_REGISTRY',
      details: { reason: error instanceof SyntaxError ? 'invalid_json' : 'unavailable' }
    });
  }
  if (!parsed || parsed.schemaVersion !== 1 || !parsed.operations ||
      typeof parsed.operations !== 'object' || Array.isArray(parsed.operations)) {
    throw new ConfigurationError('Operation registry has an unsupported schema.');
  }
  const registry = {};
  for (const [name, descriptor] of Object.entries(parsed.operations)) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name)) {
      throw new ConfigurationError('Operation registry contains an invalid operation name.');
    }
    registry[name] = normalizeDescriptor(name, descriptor);
  }
  return Object.freeze(registry);
}

function mergeOperationRegistries(base, overrides = {}) {
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
    throw new ConfigurationError('apiOperations must be an object.');
  }
  return Object.freeze({ ...base, ...overrides });
}

module.exports = {
  DEFAULT_REGISTRY_PATH,
  loadOperationsRegistry,
  mergeOperationRegistries,
  resolveTemplate,
  validateInputSchema
};
