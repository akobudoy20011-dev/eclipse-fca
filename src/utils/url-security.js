'use strict';

const { ConfigurationError } = require('../core/errors');

function validateFacebookUrl(value, protocol, label = 'URL') {
  let url;
  try {
    url = new URL(value);
  } catch (cause) {
    throw new ConfigurationError(`${label} must be an absolute URL.`, { cause });
  }

  const hostname = url.hostname.toLowerCase();
  const trustedHost = hostname === 'facebook.com' || hostname.endsWith('.facebook.com');
  if (url.protocol !== protocol || !trustedHost || url.username || url.password) {
    throw new ConfigurationError(`${label} must use ${protocol}// on a facebook.com host and must not contain URL credentials.`);
  }
  return url;
}

function isFacebookHttpsUrl(value) {
  try {
    validateFacebookUrl(value, 'https:', 'Request URL');
    return true;
  } catch {
    return false;
  }
}

module.exports = { validateFacebookUrl, isFacebookHttpsUrl };
