'use strict';

const { ConfigurationError, TransportError } = require('../core/errors');

const TYPES = Object.freeze({
  STOP: 0, BOOL: 2, BYTE: 3, DOUBLE: 4, I16: 6, I32: 8,
  I64: 10, STRING: 11, STRUCT: 12, MAP: 13, SET: 14, LIST: 15
});
const TYPE_NAMES = Object.freeze(Object.fromEntries(Object.entries(TYPES).map(([name, value]) => [value, name])));
const DEFAULT_LIMITS = Object.freeze({ maxBytes: 1024 * 1024, maxDepth: 32, maxCollectionLength: 10000 });

function protocolError(message) {
  return new TransportError(message, { code: 'ERR_THRIFT_PROTOCOL' });
}

class Reader {
  constructor(buffer, limits) {
    if (!Buffer.isBuffer(buffer)) throw new ConfigurationError('Thrift payload must be a Buffer.');
    if (buffer.length > limits.maxBytes) throw protocolError('Thrift payload exceeds the configured size limit.');
    this.buffer = buffer;
    this.offset = 0;
    this.limits = limits;
  }
  require(size) {
    if (!Number.isSafeInteger(size) || size < 0 || this.offset + size > this.buffer.length) {
      throw protocolError('Thrift payload is truncated or malformed.');
    }
  }
  byte() { this.require(1); return this.buffer.readInt8(this.offset++); }
  i16() { this.require(2); const v = this.buffer.readInt16BE(this.offset); this.offset += 2; return v; }
  i32() { this.require(4); const v = this.buffer.readInt32BE(this.offset); this.offset += 4; return v; }
  i64() { this.require(8); const v = this.buffer.readBigInt64BE(this.offset); this.offset += 8; return v; }
  double() { this.require(8); const v = this.buffer.readDoubleBE(this.offset); this.offset += 8; return v; }
  bytes() {
    const length = this.i32();
    if (length < 0 || length > this.limits.maxBytes) throw protocolError('Invalid Thrift binary length.');
    this.require(length);
    const value = this.buffer.subarray(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }
  string() { return this.bytes().toString('utf8'); }
  collectionLength() {
    const length = this.i32();
    if (length < 0 || length > this.limits.maxCollectionLength) throw protocolError('Invalid Thrift collection length.');
    return length;
  }
  value(type, depth) {
    if (depth > this.limits.maxDepth) throw protocolError('Thrift nesting exceeds the configured depth limit.');
    switch (type) {
      case TYPES.BOOL: return this.byte() !== 0;
      case TYPES.BYTE: return this.byte();
      case TYPES.DOUBLE: return this.double();
      case TYPES.I16: return this.i16();
      case TYPES.I32: return this.i32();
      case TYPES.I64: return this.i64();
      case TYPES.STRING: return this.string();
      case TYPES.STRUCT: return this.struct(depth + 1);
      case TYPES.LIST:
      case TYPES.SET: {
        this.require(1);
        const elementType = this.buffer.readUInt8(this.offset++);
        const length = this.collectionLength();
        const values = [];
        for (let i = 0; i < length; i++) values.push(this.value(elementType, depth + 1));
        return { elementType, values };
      }
      case TYPES.MAP: {
        this.require(2);
        const keyType = this.buffer.readUInt8(this.offset++);
        const valueType = this.buffer.readUInt8(this.offset++);
        const length = this.collectionLength();
        const entries = [];
        for (let i = 0; i < length; i++) {
          entries.push([this.value(keyType, depth + 1), this.value(valueType, depth + 1)]);
        }
        return { keyType, valueType, entries };
      }
      default: throw protocolError('Unsupported Thrift field type ' + type + '.');
    }
  }
  struct(depth = 0) {
    if (depth > this.limits.maxDepth) throw protocolError('Thrift nesting exceeds the configured depth limit.');
    const fields = [];
    while (true) {
      this.require(1);
      const type = this.buffer.readUInt8(this.offset++);
      if (type === TYPES.STOP) break;
      if (!TYPE_NAMES[type]) throw protocolError('Unknown Thrift field type.');
      const id = this.i16();
      fields.push({ id, type, typeName: TYPE_NAMES[type], value: this.value(type, depth + 1) });
      if (fields.length > this.limits.maxCollectionLength) throw protocolError('Thrift struct contains too many fields.');
    }
    return fields;
  }
}

function encodeValue(type, value, chunks, depth, limits) {
  if (depth > limits.maxDepth) throw new ConfigurationError('Thrift value exceeds maximum nesting depth.');
  const push = buffer => chunks.push(buffer);
  const int = (size, method, input) => { const b = Buffer.alloc(size); b[method](input, 0); push(b); };
  switch (type) {
    case TYPES.BOOL: int(1, 'writeInt8', value ? 1 : 0); break;
    case TYPES.BYTE: int(1, 'writeInt8', value); break;
    case TYPES.I16: int(2, 'writeInt16BE', value); break;
    case TYPES.I32: int(4, 'writeInt32BE', value); break;
    case TYPES.I64: {
      let v;
      try { v = BigInt(value); } catch { throw new ConfigurationError('Thrift I64 values must be integers.'); }
      const b = Buffer.alloc(8); b.writeBigInt64BE(v); push(b); break;
    }
    case TYPES.DOUBLE: {
      const b = Buffer.alloc(8); b.writeDoubleBE(value); push(b); break;
    }
    case TYPES.STRING: {
      const b = Buffer.from(value, 'utf8');
      if (b.length > limits.maxBytes) throw new ConfigurationError('Thrift string exceeds the configured size limit.');
      int(4, 'writeInt32BE', b.length); push(b); break;
    }
    case TYPES.STRUCT: encodeStruct(value, chunks, depth + 1, limits); break;
    case TYPES.LIST:
    case TYPES.SET: {
      if (!value || !Array.isArray(value.values) || value.values.length > limits.maxCollectionLength ||
          !TYPE_NAMES[value.elementType] || value.elementType === TYPES.STOP) {
        throw new ConfigurationError('Thrift list/set requires a valid element type and bounded values array.');
      }
      const header = Buffer.alloc(5); header.writeUInt8(value.elementType, 0); header.writeInt32BE(value.values.length, 1); push(header);
      for (const item of value.values) encodeValue(value.elementType, item, chunks, depth + 1, limits);
      break;
    }
    case TYPES.MAP: {
      if (!value || !Array.isArray(value.entries) || value.entries.length > limits.maxCollectionLength ||
          !TYPE_NAMES[value.keyType] || value.keyType === TYPES.STOP ||
          !TYPE_NAMES[value.valueType] || value.valueType === TYPES.STOP) {
        throw new ConfigurationError('Thrift map requires valid key/value types and a bounded entries array.');
      }
      const header = Buffer.alloc(6); header.writeUInt8(value.keyType, 0); header.writeUInt8(value.valueType, 1); header.writeInt32BE(value.entries.length, 2); push(header);
      for (const [key, item] of value.entries) {
        encodeValue(value.keyType, key, chunks, depth + 1, limits);
        encodeValue(value.valueType, item, chunks, depth + 1, limits);
      }
      break;
    }
    default: throw new ConfigurationError('Unsupported Thrift field type.');
  }
}

function encodeStruct(fields, chunks, depth, limits) {
  if (!Array.isArray(fields) || fields.length > limits.maxCollectionLength) {
    throw new ConfigurationError('Thrift struct fields must be a bounded array.');
  }
  for (const field of fields) {
    if (!field || !Number.isInteger(field.id) || field.id < -32768 || field.id > 32767 ||
        !TYPE_NAMES[field.type] || field.type === TYPES.STOP) {
      throw new ConfigurationError('Invalid Thrift field descriptor.');
    }
    const header = Buffer.alloc(3);
    header.writeUInt8(field.type, 0);
    header.writeInt16BE(field.id, 1);
    chunks.push(header);
    encodeValue(field.type, field.value, chunks, depth + 1, limits);
  }
  chunks.push(Buffer.from([TYPES.STOP]));
}

function normalizeLimits(input = {}) {
  const limits = { ...DEFAULT_LIMITS, ...input };
  if (!Number.isInteger(limits.maxBytes) || limits.maxBytes < 1 ||
      !Number.isInteger(limits.maxDepth) || limits.maxDepth < 1 ||
      !Number.isInteger(limits.maxCollectionLength) || limits.maxCollectionLength < 1) {
    throw new ConfigurationError('Invalid Thrift codec limits.');
  }
  return limits;
}

function encodeThriftStruct(fields, options = {}) {
  const limits = normalizeLimits(options);
  const chunks = [];
  encodeStruct(fields, chunks, 0, limits);
  const buffer = Buffer.concat(chunks);
  if (buffer.length > limits.maxBytes) throw new ConfigurationError('Encoded Thrift payload exceeds the configured size limit.');
  return buffer;
}

function decodeThriftStruct(buffer, options = {}) {
  const reader = new Reader(buffer, normalizeLimits(options));
  const fields = reader.struct();
  if (reader.offset !== buffer.length) throw protocolError('Trailing bytes follow the Thrift struct.');
  return fields;
}

module.exports = { TYPES, DEFAULT_LIMITS, encodeThriftStruct, decodeThriftStruct };
