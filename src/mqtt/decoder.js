'use strict';

function decodePayload(payload) {
  const text = Buffer.isBuffer(payload) ? payload.toString('utf8') : String(payload ?? '');
  try {
    return JSON.parse(text);
  } catch {
    return Object.freeze({ type: 'raw', text });
  }
}

module.exports = { decodePayload };
