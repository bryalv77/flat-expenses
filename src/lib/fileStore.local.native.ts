import { Directory, File, Paths } from 'expo-file-system';
import type { FileStore } from './fileStore';
import { assertSafeKey, readPicked } from './fileStore.localShared';

// TODO(T14): exclude this directory from iCloud/Google backup; expo-file-system 57 has no API for it, so do it in config/a config plugin.
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
  async deleteFolder(path) {
    const d = new Directory(root(), assertSafeKey(path, { folder: true }));
    if (d.exists) d.delete();
  },
};
