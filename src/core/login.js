'use strict';

const { normalizeAppState, serializeCookies, mergeSetCookie } = require('../utils/cookies');
const { validateFacebookUrl } = require('../utils/url-security');
const { TokenManager } = require('./token-manager');
const { TransportError } = require('./errors');

async function loginWithAppState(options = {}) {
  const { requestClient, sessionStore, sessionKey = 'default' } = options;
  if (!requestClient || typeof requestClient.request !== 'function') {
    throw new TypeError('loginWithAppState requires a requestClient.');
  }
  if (!sessionStore || typeof sessionStore.set !== 'function') {
    throw new TypeError('loginWithAppState requires a sessionStore.');
  }

  const homeUrl = options.homeUrl || 'https://www.facebook.com/';
  validateFacebookUrl(homeUrl, 'https:', 'Login URL');
  let cookies = normalizeAppState(options.appState);
  const response = await requestClient.request({
    method: 'GET',
    url: homeUrl,
    headers: { cookie: serializeCookies(cookies) },
    responseType: 'text'
  });

  const html = typeof response.data === 'string' ? response.data : '';
  const tokenManager = new TokenManager();
  tokenManager.updateFromHtml(html);
  if (!tokenManager.snapshot().userId) {
    const cUser = cookies.find(cookie => cookie.key === 'c_user')?.value;
    if (cUser && /^\d+$/.test(cUser)) {
      tokenManager.updateFromHtml(`"USER_ID":"${cUser}"`);
    }
  }
  const finalTokens = tokenManager.snapshot();
  if (!finalTokens.userId || !finalTokens.fb_dtsg) {
    throw new TransportError('Session cookies were accepted but required page tokens could not be extracted. Login is not considered complete.', {
      code: 'ERR_AUTH_INCOMPLETE'
    });
  }

  cookies = mergeSetCookie(cookies, response.headers?.['set-cookie']);
  const session = Object.freeze({
    cookies,
    userId: finalTokens.userId,
    tokens: finalTokens,
    authenticatedAt: new Date().toISOString()
  });
  await sessionStore.set(sessionKey, session);
  return session;
}

module.exports = { loginWithAppState };
