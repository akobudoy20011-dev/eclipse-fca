'use strict';

const { TransportError } = require('./errors');

function extractPageTokens(html) {
  if (typeof html !== 'string') throw new TypeError('HTML response must be a string.');

  const find = patterns => {
    for (const pattern of patterns) {
      const match = pattern.exec(html);
      if (match?.[1]) {
        try { return JSON.parse(`"${match[1]}"`); } catch { return match[1]; }
      }
    }
    return null;
  };

  const fbDtsg = find([
    /"DTSGInitialData"\s*,\s*\[\]\s*,\s*\{"token":"([^"]+)"/,
    /"fb_dtsg"\s*:\s*\{"token":"([^"]+)"/,
    /name=["']fb_dtsg["'][^>]*value=["']([^"']+)["']/i,
    /value=["']([^"']+)["'][^>]*name=["']fb_dtsg["']/i
  ]);
  const lsd = find([
    /"LSD"\s*,\s*\[\]\s*,\s*\{"token":"([^"]+)"/,
    /name=["']lsd["'][^>]*value=["']([^"']+)["']/i
  ]);
  const jazoest = find([
    /name=["']jazoest["'][^>]*value=["']([^"']+)["']/i,
    /"jazoest"\s*:\s*"([^"]+)"/
  ]);
  const actorId = find([
    /"USER_ID"\s*:\s*"?(\d+)"?/,
    /"actorID"\s*:\s*"?(\d+)"?/,
    /name=["']c_user["'][^>]*value=["'](\d+)["']/i
  ]);

  return Object.freeze({ fb_dtsg: fbDtsg, lsd, jazoest, userId: actorId });
}

class TokenManager {
  #tokens = Object.freeze({ fb_dtsg: null, lsd: null, jazoest: null, userId: null });

  updateFromHtml(html) {
    const next = extractPageTokens(html);
    this.#tokens = Object.freeze({
      fb_dtsg: next.fb_dtsg || this.#tokens.fb_dtsg,
      lsd: next.lsd || this.#tokens.lsd,
      jazoest: next.jazoest || this.#tokens.jazoest,
      userId: next.userId || this.#tokens.userId
    });
    return this.snapshot();
  }

  snapshot() {
    return { ...this.#tokens };
  }

  requireAuthTokens() {
    if (!this.#tokens.fb_dtsg || !this.#tokens.userId) {
      throw new TransportError('Facebook page did not expose the required session tokens.', {
        code: 'ERR_AUTH_TOKENS_MISSING'
      });
    }
    return this.snapshot();
  }
}

module.exports = { TokenManager, extractPageTokens };
