import type { SqlDb } from './api/local/sql';
import type { FileStore } from './fileStore';
import { assertSafeKey, readPicked } from './fileStore.localShared';

/** Files live in the `blobs` table of the app's SQLite DB (docs/local-mode-spike.md). */
export function createWebFileStore(db: SqlDb): FileStore {
  const urls = new Map<string, string>(); // path -> live object URL, revoked on delete
  let persistAsked = false;
  const revoke = (path: string) => {
    const u = urls.get(path);
    if (u) URL.revokeObjectURL(u);
    urls.delete(path);
  };

  return {
    async upload(key, file, onProgress) {
      const { bytes, result } = await readPicked(key, file);
      if (!persistAsked) {
        persistAsked = true;
        // Best effort: browsers may evict site storage otherwise.
        Promise.resolve(navigator.storage?.persist?.()).catch(() => undefined);
      }
      await db.run('insert or replace into blobs (path, mime_type, data) values (?, ?, ?)', [key, file.mimeType, bytes]);
      revoke(key);
      onProgress?.(1);
      return result;
    },
    async getUrl(key) {
      assertSafeKey(key);
      const cached = urls.get(key);
      if (cached) return cached;
      const row = await db.get<{ mime_type: string; data: Uint8Array }>('select mime_type, data from blobs where path = ?', [key]);
      if (!row) throw new Error(`File not found: ${key}`);
      const url = URL.createObjectURL(new Blob([row.data as BlobPart], { type: row.mime_type }));
      urls.set(key, url);
      return url;
    },
    async delete(key) {
      assertSafeKey(key);
      await db.run('delete from blobs where path = ?', [key]);
      revoke(key);
    },
    async list(prefix) {
      const p = prefix ? assertSafeKey(prefix, { folder: true }) + '/' : '';
      const rows = await db.all<{ path: string }>(
        p ? 'select path from blobs where path >= ? and path < ?' : 'select path from blobs',
        p ? [p, p.slice(0, -1) + '0'] : [],
      );
      return rows.map((r) => r.path);
    },
    async deleteFolder(path) {
      const prefix = assertSafeKey(path, { folder: true }) + '/';
      // '0' is the character after '/', so this range is exactly the keys under the prefix.
      await db.run('delete from blobs where path >= ? and path < ?', [prefix, prefix.slice(0, -1) + '0']);
      for (const k of [...urls.keys()]) if (k.startsWith(prefix)) revoke(k);
    },
  };
}

let shared: FileStore | undefined;
/** Lazily opens the app DB on first use (the module is imported at startup, the DB is not needed until then). */
export const localFileStore: FileStore = (() => {
  const get = async () => {
    if (!shared) {
      const { getLocalDb } = await import('./api/local/sql.expo');
      shared = createWebFileStore(await getLocalDb());
    }
    return shared;
  };
  return {
    upload: async (...a) => (await get()).upload(...a),
    getUrl: async (...a) => (await get()).getUrl(...a),
    delete: async (...a) => (await get()).delete(...a),
    deleteFolder: async (...a) => (await get()).deleteFolder!(...a),
    list: async (...a) => (await get()).list!(...a),
  };
})();
