'use strict';

const axios = require('axios');
const { createProxyAgents } = require('./proxy');
const { TransportError } = require('./errors');

function createRequestClient(config, options = {}) {
  const agents = config.network.mode === 'proxy'
    ? createProxyAgents(config.network.proxy)
    : {};

  const instance = (options.axios ?? axios).create({
    timeout: config.network.timeout,
    maxRedirects: 5,
    validateStatus: status => status >= 200 && status < 400,
    headers: {
      'accept': 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
      'accept-language': 'en-US,en;q=0.9',
      'cache-control': 'no-cache',
      'user-agent': options.userAgent || 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
    },
    ...agents,
    proxy: false
  });

  async function request(input) {
    if (!input || typeof input !== 'object' || typeof input.url !== 'string') {
      throw new TypeError('request requires an options object with a URL.');
    }
    try {
      return await instance.request({
        method: input.method || 'GET',
        url: input.url,
        headers: input.headers,
        params: input.params,
        data: input.data,
        timeout: input.timeout,
        signal: input.signal,
        responseType: input.responseType || 'text',
        maxBodyLength: input.maxBodyLength || 10 * 1024 * 1024,
        maxContentLength: input.maxContentLength || 10 * 1024 * 1024
      });
    } catch (cause) {
      throw new TransportError('HTTP request failed.', {
        code: 'ERR_HTTP_REQUEST',
        cause,
        details: {
          method: input.method || 'GET',
          host: safeHost(input.url),
          status: cause.response?.status
        }
      });
    }
  }

  return Object.freeze({ request, defaults: instance.defaults });
}

function safeHost(value) {
  try { return new URL(value).host; } catch { return 'invalid-url'; }
}

module.exports = { createRequestClient };
