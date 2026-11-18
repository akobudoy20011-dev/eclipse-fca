'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  TYPES, encodeThriftStruct, decodeThriftStruct
} = require('../src/mqtt/thrift-binary');
const {
  encodeThriftFrame, decodeThriftFrame, decodeMqttPayload,
  encodeLightspeedPayload, classifyLightspeedTopic
} = require('../src/mqtt/codec');

const fields = [
  { id: 1, type: TYPES.STRING, value: 'synthetic-message' },
  { id: 2, type: TYPES.I32, value: 42 },
  { id: 3, type: TYPES.BOOL, value: true },
  { id: 4, type: TYPES.I64, value: 9007199254740993n },
  { id: 5, type: TYPES.LIST, value: { elementType: TYPES.STRING, values: ['one', 'two'] } },
  { id: 6, type: TYPES.STRUCT, value: [
    { id: 1, type: TYPES.BYTE, value: 7 }
  ] }
];

test('encodes and decodes a synthetic Thrift Binary Protocol struct', () => {
  const encoded = encodeThriftStruct(fields);
  const decoded = decodeThriftStruct(encoded);
  assert.equal(decoded[0].value, 'synthetic-message');
  assert.equal(decoded[1].value, 42);
  assert.equal(decoded[2].value, true);
  assert.equal(decoded[3].value, 9007199254740993n);
  assert.deepEqual(decoded[4].value.values, ['one', 'two']);
  assert.equal(decoded[5].value[0].value, 7);
});

test('round-trips the ECLIPSE explicit Thrift frame', () => {
  const frame = encodeThriftFrame(fields);
  const decoded = decodeThriftFrame(frame);
  assert.equal(decoded.type, 'thrift');
  assert.equal(decoded.framing, 'eclipse-thrift-v1');
  assert.equal(decoded.fields[0].value, 'synthetic-message');
});

test('rejects bad frame headers, truncation and trailing bytes', () => {
  const frame = encodeThriftFrame(fields);
  const badMagic = Buffer.from(frame);
  badMagic[0] = 0;
  assert.throws(() => decodeThriftFrame(badMagic), { code: 'ERR_MQTT_FRAME' });
  assert.throws(() => decodeThriftFrame(frame.subarray(0, frame.length - 1)), { code: 'ERR_MQTT_FRAME' });
  assert.throws(() => decodeThriftStruct(Buffer.concat([encodeThriftStruct([]), Buffer.from([1])])), {
    code: 'ERR_THRIFT_PROTOCOL'
  });
});

test('enforces payload and nesting limits', () => {
  const encoded = encodeThriftStruct([{ id: 1, type: TYPES.STRING, value: 'long-value' }]);
  assert.throws(() => decodeThriftStruct(encoded, { maxBytes: 4 }), {
    code: 'ERR_THRIFT_PROTOCOL'
  });
  assert.throws(() => encodeThriftStruct(fields, { maxDepth: 1 }), {
    code: 'ERR_CONFIGURATION'
  });
});

test('recognizes LightSpeed topic families without claiming their wire schema', () => {
  assert.equal(classifyLightspeedTopic('/ls_req'), 'ls_req');
  assert.equal(classifyLightspeedTopic('/ls_req/123'), 'ls_req');
  assert.equal(classifyLightspeedTopic('/ls_resp'), 'ls_resp');
  assert.equal(classifyLightspeedTopic('/other'), null);
  assert.deepEqual(decodeMqttPayload(Buffer.from('{"type":"json"}'), { topic: '/ls_resp' }), {
    type: 'json',
    topicFamily: 'ls_resp'
  });
});

test('decodes an explicitly framed payload on a LightSpeed response topic', () => {
  const frame = encodeLightspeedPayload(fields, '/ls_resp');
  const decoded = decodeMqttPayload(frame, { topic: '/ls_resp' });
  assert.equal(decoded.topicFamily, 'ls_resp');
  assert.equal(decoded.fields[1].value, 42);
});

test('refuses to label arbitrary topics as LightSpeed frames', () => {
  assert.throws(() => encodeLightspeedPayload(fields, '/inbox'), {
    code: 'ERR_CONFIGURATION'
  });
});
