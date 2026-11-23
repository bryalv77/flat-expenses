/** Layout of stored file keys, shared by the app (builders in storage.ts) and the Worker (authorization). Must stay import-free. */
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
