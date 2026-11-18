'use strict';

const { StateError } = require('./errors');

class SessionCircuitBreaker {
  #tripped = false;
  #reason = null;
  #trippedAt = null;

  get tripped() { return this.#tripped; }
  get reason() { return this.#reason; }
  get trippedAt() { return this.#trippedAt; }

  assertClosed() {
    if (this.#tripped) {
      throw new StateError('The authenticated session has been invalidated. Re-authentication is required.', {
        code: 'ERR_SESSION_INVALIDATED',
        details: { reason: this.#reason }
      });
    }
  }

  trip(reason = 'session_expired') {
    if (this.#tripped) return false;
    const allowed = new Set(['checkpoint', 'logout_redirect', 'missing_session_cookie', 'auth_error', 'mqtt_auth_rejected']);
    this.#reason = allowed.has(reason) ? reason : 'session_expired';
    this.#trippedAt = new Date().toISOString();
    this.#tripped = true;
    return true;
  }
}

module.exports = { SessionCircuitBreaker };
