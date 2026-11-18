'use strict';

class MemorySessionStore {
  #sessions = new Map();

  async get(key) {
    return this.#sessions.get(key) ?? null;
  }

  async set(key, value) {
    if (typeof key !== 'string' || key.length === 0) {
      throw new TypeError('Session key must be a non-empty string.');
    }
    this.#sessions.set(key, value);
  }

  async delete(key) {
    return this.#sessions.delete(key);
  }

  async clear() {
    this.#sessions.clear();
  }
}

module.exports = { MemorySessionStore };
