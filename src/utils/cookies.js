'use strict';

function parseCookieHeader(header) {
  if (typeof header !== 'string' || !header.trim()) return [];
  return header.split(';').map(part => {
    const index = part.indexOf('=');
    if (index <= 0) return null;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key || /[\r\n;]/.test(key) || /[\r\n]/.test(value)) return null;
    return { key, value };
  }).filter(Boolean);
}

function normalizeAppState(appState) {
  if (!Array.isArray(appState) || appState.length === 0) {
    throw new TypeError('appState must be a non-empty cookie array.');
  }
  const cookies = new Map();
  for (const item of appState) {
    if (!item || typeof item !== 'object') continue;
    const key = String(item.key ?? item.name ?? '').trim();
    const value = String(item.value ?? '');
    if (!key || /[\r\n;=]/.test(key) || /[\r\n;]/.test(value)) continue;
    cookies.set(key, value);
  }
  if (!cookies.has('c_user') || !cookies.has('xs')) {
    throw new TypeError('appState must include both c_user and xs cookies.');
  }
  return [...cookies].map(([key, value]) => ({ key, value }));
}

function serializeCookies(cookies) {
  return cookies.map(({ key, value }) => `${key}=${value}`).join('; ');
}

function mergeSetCookie(existing, setCookieHeaders) {
  const map = new Map(existing.map(({ key, value }) => [key, value]));
  for (const line of setCookieHeaders || []) {
    const first = String(line).split(';', 1)[0];
    const parsed = parseCookieHeader(first)[0];
    if (parsed) map.set(parsed.key, parsed.value);
  }
  return [...map].map(([key, value]) => ({ key, value }));
}

module.exports = { parseCookieHeader, normalizeAppState, serializeCookies, mergeSetCookie };
