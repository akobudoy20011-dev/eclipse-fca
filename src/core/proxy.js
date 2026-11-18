'use strict';

const { ConfigurationError, TransportError } = require('./errors');

function createProxyAgents(proxyUrl) {
  if (typeof proxyUrl !== 'string' || !proxyUrl.trim()) {
    throw new ConfigurationError('A proxy URL is required in proxy mode.');
  }

  let parsed;
  try {
    parsed = new URL(proxyUrl);
  } catch {
    throw new ConfigurationError('network.proxy must be a valid URL.');
  }

  const protocol = parsed.protocol.toLowerCase();
  if (!['http:', 'https:', 'socks:', 'socks4:', 'socks4a:', 'socks5:', 'socks5h:'].includes(protocol)) {
    throw new ConfigurationError('Proxy protocol must be HTTP(S) or SOCKS4/5.');
  }

  try {
    if (protocol.startsWith('socks')) {
      const { SocksProxyAgent } = require('socks-proxy-agent');
      const agent = new SocksProxyAgent(parsed);
      return { httpAgent: agent, httpsAgent: agent };
    }

    const { HttpProxyAgent } = require('http-proxy-agent');
    const { HttpsProxyAgent } = require('https-proxy-agent');
    return {
      httpAgent: new HttpProxyAgent(parsed),
      httpsAgent: new HttpsProxyAgent(parsed)
    };
  } catch {
    throw new TransportError('Could not initialize the configured proxy agent.', {
      code: 'ERR_PROXY_INITIALIZATION'
    });
  }
}

module.exports = { createProxyAgents };
