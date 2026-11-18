'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { decodePayload } = require('../src/mqtt/decoder');
const { parseOperationResponse } = require('../src/api/_operation');

function loadFixture(relativePath, expectedType) {
  const path = join(__dirname, 'fixtures', relativePath);
  const fixture = JSON.parse(readFileSync(path, 'utf8'));
  assert.equal(fixture.fixtureType, expectedType, 'fixture type must be explicit');
  assert.equal(fixture.provenance, 'synthetic', 'committed examples must be synthetic or sanitized derivatives');
  assert.equal(fixture.protocolVerified, false, 'synthetic fixtures cannot claim protocol verification');
  assert.equal(fixture.encoding, 'utf8');
  assert.equal(typeof fixture.payload, 'string');
  return fixture.payload;
}

test('replays a synthetic MQTT message envelope without network access', () => {
  const decoded = decodePayload(Buffer.from(loadFixture('mqtt/message.synthetic.json', 'mqtt-payload')));
  assert.equal(decoded.type, 'message');
  assert.equal(decoded.threadID, 'THREAD_A');
  assert.equal(decoded.messageID, 'MESSAGE_A');
  assert.equal(decoded.body, 'SYNTHETIC_MESSAGE');
});

test('preserves unknown MQTT payloads for future protocol analysis', () => {
  const decoded = decodePayload(Buffer.from(loadFixture('mqtt/unknown.synthetic.json', 'mqtt-payload')));
  assert.deepEqual(decoded, { type: 'raw', text: 'opaque-placeholder-payload' });
});

test('parses a synthetic GraphQL success response', () => {
  const parsed = parseOperationResponse(loadFixture('graphql/success.synthetic.json', 'graphql-response'), 'sendMessage', 200);
  assert.equal(parsed.data.sendMessage.status, 'SENT');
  assert.equal(parsed.data.sendMessage.message_id, 'MESSAGE_A');
});

test('classifies a synthetic GraphQL application error without exposing payload contents', () => {
  const payload = loadFixture('graphql/error.synthetic.json', 'graphql-response');
  assert.throws(() => parseOperationResponse(payload, 'sendMessage', 200), error => {
    assert.equal(error.code, 'ERR_API_APPLICATION');
    assert.equal(error.details.errorCount, 1);
    assert.equal(error.message.includes('Synthetic validation error'), false);
    return true;
  });
});

test('parses anti-JSON-prefixed GraphQL fixture responses', () => {
  const parsed = parseOperationResponse('for (;;);' + loadFixture('graphql/success.synthetic.json', 'graphql-response'));
  assert.equal(parsed.data.sendMessage.status, 'SENT');
});
