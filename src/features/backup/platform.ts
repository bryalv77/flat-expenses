import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { todayISO } from '@/lib/dates';

import type { BackupFiles } from './backup';

const FILE_NAME = () => `costos-backup-${todayISO()}.zip`;

const nativeRoot = () => new Directory(Paths.document, 'files'); // same root as fileStore.local.native.ts

function listNative(dir: Directory, prefix: string, out: string[]) {
  for (const e of dir.list()) {
    if (e instanceof Directory) listNative(e, `${prefix}${e.name}/`, out);
    else out.push(prefix + e.name);
  }
}

const nativeFiles: BackupFiles = {
  async list() {
    const out: string[] = [];
    if (nativeRoot().exists) listNative(nativeRoot(), '', out);
    return out;
  },
  async read(key) {
    const f = new File(nativeRoot(), key);
    return f.exists ? await f.bytes() : null;
  },
  async write(key, bytes) {
    const f = new File(nativeRoot(), key);
    f.parentDirectory.create({ intermediates: true, idempotent: true });
    f.write(bytes);
  },
  async remove(key) {
    const f = new File(nativeRoot(), key);
    if (f.exists) f.delete();
  },
};

// Web files live in the blobs table of the shared app DB.
const db = async () => (await import('@/lib/api/local/sql.expo')).getLocalDb();
const webFiles: BackupFiles = {
  list: async () => (await (await db()).all<{ path: string }>('select path from blobs')).map((r) => r.path),
  async read(key) {
    const row = await (await db()).get<{ data: Uint8Array }>('select data from blobs where path = ?', [key]);
    return row ? new Uint8Array(row.data) : null;
  },
  async write(key, bytes, mimeType) {
    await (await db()).run('insert or replace into blobs (path, mime_type, data) values (?, ?, ?)', [key, mimeType, bytes]);
  },
  async remove(key) {
    await (await db()).run('delete from blobs where path = ?', [key]);
  },
};

export const appBackupFiles: BackupFiles = Platform.OS === 'web' ? webFiles : nativeFiles;

/** Native: cache file + share sheet. Web: Blob download. */
export async function shareBackup(archive: Uint8Array): Promise<void> {
  const name = FILE_NAME();
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([archive as BlobPart], { type: 'application/zip' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return;
  }
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  file.write(archive);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available');
  await Sharing.shareAsync(file.uri, { mimeType: 'application/zip', dialogTitle: name, UTI: 'public.zip-archive' });
}

/** Returns the chosen archive bytes, or null when the picker was cancelled. */
export async function pickBackup(): Promise<Uint8Array | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'], copyToCacheDirectory: true });
  if (res.canceled || !res.assets[0]) return null;
  return new Uint8Array(await (await fetch(res.assets[0].uri)).arrayBuffer());
}
