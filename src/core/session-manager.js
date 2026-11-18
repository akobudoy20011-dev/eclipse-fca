'use strict';

const { mergeSetCookie, serializeCookies } = require('../utils/cookies');
const { SessionCircuitBreaker } = require('./circuit-breaker');
const { StateError } = require('./errors');

const CRITICAL_COOKIES = new Set(['xs', 'c_user', 'fr', 'sb', 'datr']);

function responseExpiryReason(response) {
  const status = Number(response?.status || 0);
  const location = String(response?.headers?.location || '');
  if (/\/checkpoint(?:\/|\?|$)/i.test(location)) return 'checkpoint';
  if (/\/(?:login|recover)(?:\/|\?|$)/i.test(location) && status >= 300 && status < 400) return 'logout_redirect';
  let body;
  try { body = typeof response?.data === 'string' ? response.data : JSON.stringify(response?.data ?? ''); }
  catch { body = ''; }
  if (/\/checkpoint(?:\/|\?|["'\s]|$)/i.test(body)) return 'checkpoint';
  if (/(?:1357001|1357004)/.test(body)) return 'auth_error';
  return null;
}

class SessionManager {
  constructor(options = {}) {
    if (!options.sessionStore || typeof options.sessionStore.set !== 'function') {
      throw new TypeError('SessionManager requires a session store.');
    }
    this.store = options.sessionStore;
    this.sessionKey = options.sessionKey || 'default';
    this.breaker = options.breaker || new SessionCircuitBreaker();
    this.onExpired = typeof options.onExpired === 'function' ? options.onExpired : () => {};
    this.session = null;
    this.refreshProvider = typeof options.refreshProvider === 'function' ? options.refreshProvider : null;
    this.refreshPromise = null;
  }

  async setSession(session) {
    this.breaker.assertClosed();
    this.session = { ...session, cookies: session.cookies.map(cookie => ({ ...cookie })), tokens: { ...session.tokens }, invalidated: false };
    await this.store.set(this.sessionKey, this.session);
    return this.snapshot();
  }

  snapshot() {
    if (!this.session) return null;
    return {
      userId: this.session.userId,
      tokens: { ...this.session.tokens },
      authenticatedAt: this.session.authenticatedAt,
      invalidated: Boolean(this.session.invalidated)
    };
  }

  getCookieHeader() {
    return this.session ? serializeCookies(this.session.cookies) : '';
  }

  getSessionForTransport() {
    return this.session ? {
      userId: this.session.userId,
      cookies: this.session.cookies.map(cookie => ({ ...cookie })),
      tokens: { ...this.session.tokens },
      authenticatedAt: this.session.authenticatedAt
    } : null;
  }

  getCookiesForRefresh() {
    return this.session ? this.session.cookies.map(cookie => ({ ...cookie })) : [];
  }

  async waitForRefresh() {
    this.breaker.assertClosed();
    if (this.refreshPromise) await this.refreshPromise;
    this.breaker.assertClosed();
  }

  async refreshTokens() {
    this.breaker.assertClosed();
    if (!this.session || !this.refreshProvider) return false;
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = (async () => {
      const current = this.snapshot();
      const refreshed = await this.refreshProvider(current);
      if (!refreshed || !refreshed.tokens?.fb_dtsg || refreshed.userId !== current.userId) {
        throw new StateError('Session token refresh did not return a valid authenticated session.', {
          code: 'ERR_TOKEN_REFRESH_INVALID'
        });
      }
      this.session = {
        ...this.session,
        ...refreshed,
        cookies: refreshed.cookies || this.session.cookies,
        tokens: { ...this.session.tokens, ...refreshed.tokens },
        invalidated: false
      };
      await this.store.set(this.sessionKey, this.session);
      return true;
    })();
    try { return await this.refreshPromise; } finally { this.refreshPromise = null; }
  }

  async handleResponse(response) {
    if (!this.session || this.breaker.tripped) return;
    const expiry = responseExpiryReason(response);
    if (expiry) {
      await this.invalidate(expiry);
      return;
    }

    const setCookie = response?.headers?.['set-cookie'];
    if (!Array.isArray(setCookie) || !setCookie.length) return;
    const nextCookies = mergeSetCookie(this.session.cookies, setCookie);
    const changedCritical = nextCookies.some(cookie => {
      if (!CRITICAL_COOKIES.has(cookie.key)) return false;
      const previous = this.session.cookies.find(item => item.key === cookie.key);
      return !previous || previous.value !== cookie.value;
    });
    this.session = { ...this.session, cookies: nextCookies };
    if (changedCritical) await this.store.set(this.sessionKey, this.session);

    const hasUser = nextCookies.some(cookie => cookie.key === 'c_user' && cookie.value);
    const hasSession = nextCookies.some(cookie => cookie.key === 'xs' && cookie.value);
    if (!hasUser || !hasSession) await this.invalidate('missing_session_cookie');
  }

  async invalidate(reason) {
    if (!this.breaker.trip(reason)) return false;
    let persistenceFailed = false;
    if (this.session) {
      this.session = { ...this.session, invalidated: true, invalidatedAt: this.breaker.trippedAt };
      try { await this.store.set(this.sessionKey, this.session); }
      catch { persistenceFailed = true; }
    }
    await this.onExpired({
      type: 'session_expired',
      reason: this.breaker.reason,
      at: this.breaker.trippedAt,
      persistenceFailed
    });
    if (persistenceFailed) {
      throw new StateError('Session was invalidated, but its invalidation marker could not be persisted.', {
        code: 'ERR_SESSION_PERSISTENCE'
      });
    }
    return true;
  }

  assertUsable() {
    this.breaker.assertClosed();
    if (!this.session) throw new StateError('Login with an authorized appState session first.');
  }
}

module.exports = { SessionManager, responseExpiryReason, CRITICAL_COOKIES };
