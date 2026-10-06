import { mkdir, readFile, writeFile, rename, unlink, stat } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// Only these public downloads are eligible. Never cache login HTML, cookies,
// WebSocket traffic, accounts, or user-specific game files on the shared host.
export const publicAssets = {
  wasm: 'game/Build-share/Worlds.wasm.unityweb?v=701500',
  data: 'game/Build-share/Worlds.data.unityweb?v=701500',
  assets: 'game/Assets.zip',
  framework: 'game/Build-share/Worlds.framework.js.unityweb?v=701500',
};
export class AssetCache {
  constructor(directory, fetcher = fetch, ttl = 3600000) {
    this.directory = directory;
    this.fetcher = fetcher;
    this.ttl = ttl;
    this.pending = new Map();
  }
  async get(key) {
    if (!Object.hasOwn(publicAssets, key)) throw new Error('Asset is not cacheable');
    if (this.pending.has(key)) return this.pending.get(key);
    const work = this.load(key).finally(() => this.pending.delete(key));
    this.pending.set(key, work);
    return work;
  }
  async load(key) {
    await mkdir(this.directory, { recursive: true });
    const target = path.join(this.directory, key + '-701500.bin');
    const metadataPath = target + '.json';
    let metadata;
    try { metadata = JSON.parse(await readFile(metadataPath, 'utf8')); await stat(target); } catch { metadata = undefined; }
    if (metadata && Date.now() - metadata.checked < this.ttl) return { path: target, hit: true };
    const headers = {};
    if (metadata?.etag) headers['If-None-Match'] = metadata.etag;
    if (metadata?.modified) headers['If-Modified-Since'] = metadata.modified;
    const response = await this.fetcher('https://worldsplay.graalonline.com/' + publicAssets[key], { headers, signal: AbortSignal.timeout(120000) });
    if (response.status === 304 && metadata) {
      await writeFile(metadataPath, JSON.stringify({ ...metadata, checked: Date.now() }));
      return { path: target, hit: true };
    }
    if (!response.ok || !response.body) throw new Error('Public Graal asset unavailable');
    const temporary = target + '.' + randomUUID() + '.tmp';
    let bytes = 0;
    const limit = new Transform({ transform(chunk, encoding, callback) {
      bytes += chunk.length;
      callback(bytes > 512 * 1024 * 1024 ? new Error('Asset exceeds cache size limit') : null, chunk);
    } });
    try {
      await pipeline(Readable.fromWeb(response.body), limit, createWriteStream(temporary, { flags: 'wx' }));
      await rename(temporary, target);
      await writeFile(metadataPath, JSON.stringify({ checked: Date.now(), etag: response.headers.get('etag'), modified: response.headers.get('last-modified'), bytes }));
    } finally { await unlink(temporary).catch(() => {}); }
    return { path: target, hit: false };
  }
}
