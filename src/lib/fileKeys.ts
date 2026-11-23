/** Layout and rules of stored files, shared by the app (building keys, validating uploads) and the Worker (authorizing and validating). */
import { DOCUMENT_MIME_TYPES, IMAGE_MIME_TYPES, MAX_AVATAR_BYTES, MAX_FILE_BYTES } from './limits';

export type FileKind = 'avatar' | 'document' | 'bill';

// What sanitizeFileName() produces; also rules out '..' tricks (see parseFileKey).
const SEG = '[A-Za-z0-9._-]+';
const KEY: Record<FileKind, RegExp> = {
  avatar: new RegExp(`^users/(${SEG})/avatar/${SEG}$`),
  document: new RegExp(`^users/(${SEG})/documents/${SEG}/${SEG}$`),
  bill: new RegExp(`^houses/(${SEG})/bills/${SEG}/${SEG}$`),
};

/** `owner` is the uid for users/*, the houseId for houses/*. Null for any key outside the layout. */
export function parseFileKey(key: string): { kind: FileKind; owner: string } | null {
  if (key.split('/').some((s) => s === '.' || s === '..')) return null;
  for (const kind of Object.keys(KEY) as FileKind[]) {
    const m = KEY[kind].exec(key);
    if (m) return { kind, owner: m[1]! };
  }
  return null;
}

/** Avatars are images up to 2 MB; documents and bill files are images or PDF up to 10 MB. */
export const FILE_RULES: Record<FileKind, { maxBytes: number; mimeTypes: readonly string[] }> = {
  avatar: { maxBytes: MAX_AVATAR_BYTES, mimeTypes: IMAGE_MIME_TYPES },
  document: { maxBytes: MAX_FILE_BYTES, mimeTypes: DOCUMENT_MIME_TYPES },
  bill: { maxBytes: MAX_FILE_BYTES, mimeTypes: DOCUMENT_MIME_TYPES },
};

export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'file';
  const normalized = base.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  const dot = normalized.lastIndexOf('.');
  const stem = dot > 0 ? normalized.slice(0, dot) : normalized;
  const ext = dot > 0 ? normalized.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : '';
  const cleanStem = stem.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[._]+|_+$/g, '').slice(0, 80);
  const safeStem = cleanStem.length > 0 ? cleanStem : 'file';
  return ext ? `${safeStem}.${ext.slice(0, 8)}` : safeStem;
}

export const storagePaths = {
  avatar: (uid: string, fileName: string) => `users/${uid}/avatar/${sanitizeFileName(fileName)}`,
  userDocument: (uid: string, docId: string, fileName: string) =>
    `users/${uid}/documents/${docId}/${sanitizeFileName(fileName)}`,
  bill: (houseId: string, billId: string, fileName: string) =>
    `houses/${houseId}/bills/${billId}/${sanitizeFileName(fileName)}`,
};

/** Rejects empty, absolute, backslash, drive-letter and `.`/`..`/empty-segment keys (zip entries, local file paths). */
export const isSafeKey = (k: string): boolean =>
  !!k && !k.startsWith('/') && !/[\\\0]/.test(k) && !/^[a-zA-Z]:/.test(k) && !k.split('/').some((s) => s === '' || s === '.' || s === '..');
