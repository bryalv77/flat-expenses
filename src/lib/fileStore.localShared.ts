import { sanitizeFileName } from './fileKeys';
import { kindOfKey, validateFile, type PickedFile, type UploadedFile } from './storage';

/** Rejects empty, absolute, backslash and `.`/`..`/empty-segment keys. A trailing slash is allowed for folders. */
export function assertSafeKey(key: string, { folder = false } = {}): string {
  const k = folder ? key.replace(/\/$/, '') : key;
  if (!k || k.startsWith('/') || /[\\\0]/.test(k) || /^[a-zA-Z]:/.test(k) || k.split('/').some((s) => s === '' || s === '.' || s === '..')) {
    throw new Error(`Invalid file key: ${key}`);
  }
  return k;
}

/** Validates the key and the picked file, then returns its bytes plus the UploadedFile result. */
export async function readPicked(key: string, file: PickedFile): Promise<{ bytes: Uint8Array; result: UploadedFile }> {
  assertSafeKey(key);
  const blob = await (await fetch(file.uri)).blob();
  validateFile({ mimeType: file.mimeType, size: blob.size }, kindOfKey(key));
  return {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    result: { storagePath: key, fileName: sanitizeFileName(file.name), mimeType: file.mimeType, sizeBytes: blob.size },
  };
}
