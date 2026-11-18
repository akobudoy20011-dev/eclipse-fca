'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

class FileSessionStore {
  constructor(options = {}) {
    if (typeof options.directory !== 'string' || !options.directory.trim()) {
      throw new TypeError('FileSessionStore requires a non-empty directory.');
    }
    this.directory = path.resolve(options.directory);
    this.#locks = new Map();
  }

  #locks;

  #fileFor(key) {
    if (typeof key !== 'string' || !key.trim()) throw new TypeError('Session key must be a non-empty string.');
    const name = crypto.createHash('sha256').update(key).digest('hex');
    return path.join(this.directory, name + '.json');
  }

  async #ensureDirectory() {
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    await fs.chmod(this.directory, 0o700);
  }

  async get(key) {
    const file = this.#fileFor(key);
    try {
      const raw = await fs.readFile(file, 'utf8');
      return JSON.parse(raw);
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw new Error('Could not read persisted session data.');
    }
  }

  async set(key, value) {
    const file = this.#fileFor(key);
    const previous = this.#locks.get(file) || Promise.resolve();
    const operation = previous.catch(() => {}).then(async () => {
      await this.#ensureDirectory();
      const temp = path.join(this.directory, '.' + path.basename(file) + '.' + process.pid + '.' + crypto.randomBytes(8).toString('hex') + '.tmp');
      let handle;
      try {
        handle = await fs.open(temp, 'wx', 0o600);
        await handle.writeFile(JSON.stringify(value), 'utf8');
        await handle.sync();
        await handle.close();
        handle = null;
        await fs.rename(temp, file);
        await fs.chmod(file, 0o600);
        try {
          const dirHandle = await fs.open(this.directory, 'r');
          await dirHandle.sync();
          await dirHandle.close();
        } catch {}
      } catch {
        if (handle) await handle.close().catch(() => {});
        await fs.unlink(temp).catch(() => {});
        throw new Error('Could not atomically persist session data.');
      }
    });
    this.#locks.set(file, operation);
    try { await operation; } finally {
      if (this.#locks.get(file) === operation) this.#locks.delete(file);
    }
  }

  async delete(key) {
    const file = this.#fileFor(key);
    await fs.unlink(file).catch(error => {
      if (error.code !== 'ENOENT') throw new Error('Could not delete persisted session data.');
    });
  }

  async clear() {
    await this.#ensureDirectory();
    const entries = await fs.readdir(this.directory, { withFileTypes: true });
    await Promise.all(entries.filter(entry => entry.isFile() && /^[a-f0-9]{64}\.json$/.test(entry.name))
      .map(entry => fs.unlink(path.join(this.directory, entry.name))));
  }
}

module.exports = { FileSessionStore };
