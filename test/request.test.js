'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeConfig } = require('../src/core/config');
const { createRequestClient } = require('../src/core/request');

test('does not retain raw Axios errors that may contain request cookies', async () => {
  const axios = {
    create() {
      return {
        defaults: {},
        async request() {
          const error = new Error('socket failure');
          error.code = 'ECONNRESET';
          error.config = { headers: { cookie: 'c_user=private; xs=private-session' } };
          throw error;
        }
      };
    }
  };
  const requestClient = createRequestClient(normalizeConfig(), { axios });

  await assert.rejects(requestClient.request({
    url: 'https://www.facebook.com/',
    headers: { cookie: 'c_user=private; xs=private-session' }
  }), error => {
    assert.equal(error.code, 'ERR_HTTP_REQUEST');
    assert.equal(Object.hasOwn(error, 'cause'), false);
    assert.equal(JSON.stringify(error).includes('private-session'), false);
    assert.equal(error.details.transportCode, 'ECONNRESET');
    return true;
  });
});
