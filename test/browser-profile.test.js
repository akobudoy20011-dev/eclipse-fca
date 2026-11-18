'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeConfig } = require('../src/core/config');
const { createRequestClient } = require('../src/core/request');

test('browser profile is normalized and immutable', () => {
  const config = normalizeConfig({
    browserProfile: {
      userAgent: 'Mozilla/5.0 Chrome/130.0.0.0',
      secChUa: '"Chromium";v="130"',
      secChUaMobile: '?0',
      secChUaPlatform: '"Windows"'
    }
  });
  assert.equal(config.browserProfile.userAgent, 'Mozilla/5.0 Chrome/130.0.0.0');
  assert.equal(config.browserProfile.secChUa, '"Chromium";v="130"');
  assert.ok(Object.isFrozen(config.browserProfile));
});

test('HTTP requests use one configured browser header profile even if request headers conflict', async () => {
  let captured;
  const fakeAxios = {
    create(options) {
      return {
        defaults: options,
        async request(input) { captured = input; return { status: 200, data: 'ok', headers: {} }; }
      };
    }
  };
  const config = normalizeConfig({
    browserProfile: {
      userAgent: 'ECLIPSE-TEST-UA',
      secChUa: '"Chromium";v="130"',
      secChUaMobile: '?0',
      secChUaPlatform: '"Windows"'
    }
  });
  const client = createRequestClient(config, { axios: fakeAxios });
  await client.request({
    url: 'https://www.facebook.com/',
    headers: { 'user-agent': 'conflicting-agent', 'sec-ch-ua': 'conflicting-brand' }
  });
  assert.equal(captured.headers['user-agent'], 'ECLIPSE-TEST-UA');
  assert.equal(captured.headers['sec-ch-ua'], '"Chromium";v="130"');
  assert.equal(captured.headers['sec-ch-ua-platform'], '"Windows"');
  assert.equal(captured.headers['sec-fetch-site'], 'same-origin');
});
