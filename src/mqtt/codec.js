'use strict';

const { ConfigurationError, TransportError } = require('../core/errors');
const { decodePayload } = require('./decoder');
const { encodeThriftStruct, decodeThriftStruct } = require('./thrift-binary');

const MAGIC = Buffer.from('ECLT');
const VERSION = 1;
const KIND_THRIFT_STRUCT = 1;
const HEADER_LENGTH = 10;
const LIGHTSPEED_TOPICS = Object.freeze(['/ls_req', '/ls_resp']);

function classifyLightspeedTopic(topic) {
  if (typeof topic !== 'string') return null;
  if (topic === '/ls_req' || topic.startsWith('/ls_req/')) return 'ls_req';
  if (topic === '/ls_resp' || topic.startsWith('/ls_resp/')) return 'ls_resp';
  return null;
}

function encodeThriftFrame(fields, options = {}) {
  const body = encodeThriftStruct(fields, options);
  const frame = Buffer.alloc(HEADER_LENGTH + body.length);
  MAGIC.copy(frame, 0);
  frame.writeUInt8(VERSION, 4);
  frame.writeUInt8(KIND_THRIFT_STRUCT, 5);
  frame.writeUInt32BE(body.length, 6);
  body.copy(frame, HEADER_LENGTH);
  return frame;
}

function decodeThriftFrame(payload, options = {}) {
  if (!Buffer.isBuffer(payload) || payload.length < HEADER_LENGTH ||
      !payload.subarray(0, 4).equals(MAGIC)) {
    throw new TransportError('MQTT payload is not an ECLIPSE Thrift frame.', { code: 'ERR_MQTT_FRAME' });
  }
  const version = payload.readUInt8(4);
  const kind = payload.readUInt8(5);
  const length = payload.readUInt32BE(6);
  if (version !== VERSION || kind !== KIND_THRIFT_STRUCT || length !== payload.length - HEADER_LENGTH) {
    throw new TransportError('MQTT Thrift frame header is invalid.', { code: 'ERR_MQTT_FRAME' });
  }
  const fields = decodeThriftStruct(payload.subarray(HEADER_LENGTH), options);
  return Object.freeze({
    type: 'thrift',
    framing: 'eclipse-thrift-v1',
    fields
  });
}

function decodeMqttPayload(payload, options = {}) {
  const topicKind = classifyLightspeedTopic(options.topic);
  if (Buffer.isBuffer(payload) && payload.length >= MAGIC.length && payload.subarray(0, 4).equals(MAGIC)) {
    return decodeThriftFrame(payload, options.thriftLimits);
  }
  const decoded = decodePayload(payload);
  if (decoded && typeof decoded === 'object' && decoded.type !== 'raw') {
    return decoded;
  }
  return Object.freeze({
    ...decoded,
    ...(topicKind ? { topicFamily: topicKind } : {})
  });
}

function encodeLightspeedPayload(fields, topic) {
  if (!classifyLightspeedTopic(topic)) {
    throw new ConfigurationError('Thrift frames may only be associated with /ls_req or /ls_resp topic families.');
  }
  return encodeThriftFrame(fields);
}

module.exports = {
  MAGIC,
  VERSION,
  KIND_THRIFT_STRUCT,
  LIGHTSPEED_TOPICS,
  classifyLightspeedTopic,
  encodeThriftFrame,
  decodeThriftFrame,
  decodeMqttPayload,
  encodeLightspeedPayload
};
