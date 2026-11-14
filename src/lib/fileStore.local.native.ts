import { Directory, File, Paths } from 'expo-file-system';
import type { FileStore } from './fileStore';
import { assertSafeKey, readPicked } from './fileStore.localShared';

// TODO(T14) resolved in config: iOS isExcludedFromBackup is set natively by plugins/withExcludeLocalDataFromBackup.js
// (it hardcodes Documents/files and Documents/SQLite; keep in sync if this path changes); Android uses allowBackup=false.
const root = () => new Directory(Paths.document, 'files');

export const localFileStore: FileStore = {
  async upload(key, file, onProgress) {
    const { bytes, result } = await readPicked(key, file);
    const dest = new File(root(), key);
    dest.parentDirectory.create({ intermediates: true, idempotent: true });
    dest.write(bytes);
    onProgress?.(1);
    return result;
  },
  async getUrl(key) {
    return new File(root(), assertSafeKey(key)).uri;
  },
  async delete(key) {
    const f = new File(root(), assertSafeKey(key));
    if (f.exists) f.delete();
  },
  async list(prefix) {
    const base = root();
    const dir = prefix ? new Directory(base, assertSafeKey(prefix, { folder: true })) : base;
    const out: string[] = [];
    const walk = (d: Directory) => {
      if (!d.exists) return;
      for (const e of d.list()) {
        if (e instanceof Directory) walk(e);
        else out.push(e.uri.slice(base.uri.length + 1));
      }
    };
    walk(dir);
    return out;
  },
  async deleteFolder(path) {
    const d = new Directory(root(), assertSafeKey(path, { folder: true }));
    if (d.exists) d.delete();
  },
};
