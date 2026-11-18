'use strict';

class TokenRefreshScheduler {
  constructor(options = {}) {
    if (!options.sessionManager || typeof options.sessionManager.refreshTokens !== 'function') {
      throw new TypeError('TokenRefreshScheduler requires a session manager.');
    }
    this.sessionManager = options.sessionManager;
    this.baseIntervalMs = options.baseIntervalMs ?? 45 * 60 * 1000;
    this.jitterMs = options.jitterMs ?? 5 * 60 * 1000;
    this.random = options.random || Math.random;
    this.onError = typeof options.onError === 'function' ? options.onError : () => {};
    this.timer = null;
    this.running = false;
  }

  nextDelay() {
    const spread = (this.random() * 2 - 1) * this.jitterMs;
    return Math.max(1000, Math.round(this.baseIntervalMs + spread));
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.#schedule();
  }

  #schedule() {
    if (!this.running) return;
    this.timer = setTimeout(async () => {
      this.timer = null;
      try {
        await this.sessionManager.refreshTokens();
      } catch {
        this.onError({ code: 'ERR_TOKEN_REFRESH', message: 'Session token refresh failed.' });
      } finally {
        this.#schedule();
      }
    }, this.nextDelay());
    this.timer.unref?.();
  }

  stop() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

module.exports = { TokenRefreshScheduler };
