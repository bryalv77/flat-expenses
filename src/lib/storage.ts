import {
  deleteObject,
  getDownloadURL,
  listAll,
  ref,
  uploadBytesResumable,
  type StorageReference,
} from 'firebase/storage';
import { randomUUID } from 'expo-crypto';
import * as ImageManipulator from 'expo-image-manipulator';

import { storage } from './firebase';

export type FileKind = 'avatar' | 'document' | 'bill';

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/webp'] as const;
export const ALLOWED_MIME_TYPES = [...ALLOWED_IMAGE_TYPES, 'application/pdf'] as const;
export const MAX_BYTES: Record<FileKind, number> = {
  avatar: 2 * 1024 * 1024,
  document: 10 * 1024 * 1024,
  bill: 10 * 1024 * 1024,
};

export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
  size?: number | null;
}

export interface UploadedFile {
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export type FileErrorCode = 'unsupported-type' | 'too-large';
export class FileValidationError extends Error {
  constructor(
    public readonly code: FileErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'FileValidationError';
  }
}

export const storagePaths = {
  avatar: (uid: string, fileName: string) => `users/${uid}/avatar/${sanitizeFileName(fileName)}`,
  userDocument: (uid: string, docId: string, fileName: string) =>
    `users/${uid}/documents/${docId}/${sanitizeFileName(fileName)}`,
  bill: (houseId: string, billId: string, fileName: string) =>
    `houses/${houseId}/bills/${billId}/${sanitizeFileName(fileName)}`,
};

/** Strips path separators / odd characters, keeps the extension, caps length. */
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

export function isImageType(mimeType: string): boolean {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(mimeType.toLowerCase());
}

export function validateFile(file: Pick<PickedFile, 'mimeType' | 'size'>, kind: FileKind): void {
  const type = file.mimeType.toLowerCase();
  const allowed = kind === 'avatar' ? isImageType(type) : (ALLOWED_MIME_TYPES as readonly string[]).includes(type);
  if (!allowed) throw new FileValidationError('unsupported-type', `Unsupported file type: ${file.mimeType}`);
  if (file.size != null && file.size > MAX_BYTES[kind]) {
    throw new FileValidationError('too-large', `File exceeds ${MAX_BYTES[kind] / 1024 / 1024} MB`);
  }
}

/**
 * Compresses images (max 2000 px / 512 px for avatars) and converts HEIC (and anything else) to JPEG.
 * PDFs pass through untouched. Size is re-measured after compression.
 */
export async function prepareFile(file: PickedFile, kind: FileKind): Promise<PickedFile> {
  validateFile({ mimeType: file.mimeType, size: undefined }, kind);
  let result = file;
  if (isImageType(file.mimeType)) {
    const maxWidth = kind === 'avatar' ? 512 : 2000;
    const out = await ImageManipulator.manipulateAsync(
      file.uri,
      [{ resize: { width: maxWidth } }],
      { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
    );
    result = {
      uri: out.uri,
      mimeType: 'image/jpeg',
      name: file.name.replace(/\.[^.]+$/, '') + '.jpg',
    };
  }
  const size = await measureSize(result.uri, result.size ?? file.size ?? undefined);
  validateFile({ mimeType: result.mimeType, size }, kind);
  return { ...result, size };
}

async function measureSize(uri: string, fallback: number | undefined): Promise<number | undefined> {
  try {
    const blob = await (await fetch(uri)).blob();
    return blob.size;
  } catch {
    return fallback;
  }
}

/** Uploads to `storagePath` reporting progress 0..1. */
export async function uploadFile(
  storagePath: string,
  file: PickedFile,
  onProgress?: (fraction: number) => void,
): Promise<UploadedFile> {
  const blob = await (await fetch(file.uri)).blob();
  validateFile({ mimeType: file.mimeType, size: blob.size }, storagePath.includes('/avatar/') ? 'avatar' : 'document');
  const task = uploadBytesResumable(ref(storage, storagePath), blob, { contentType: file.mimeType });
  return new Promise<UploadedFile>((resolve, reject) => {
    task.on(
      'state_changed',
      (snap) => onProgress?.(snap.totalBytes > 0 ? snap.bytesTransferred / snap.totalBytes : 0),
      reject,
      () =>
        resolve({
          storagePath,
          fileName: sanitizeFileName(file.name),
          mimeType: file.mimeType,
          sizeBytes: blob.size,
        }),
    );
  });
}

/**
 * Download URL for a stored path. Storage rules check house membership through Firestore, so only
 * members can resolve bill files — see README "Security model".
 */
export function getFileUrl(storagePath: string): Promise<string> {
  return getDownloadURL(ref(storage, storagePath));
}

export async function deleteFile(storagePath: string): Promise<void> {
  try {
    await deleteObject(ref(storage, storagePath));
  } catch (e) {
    if ((e as { code?: string }).code !== 'storage/object-not-found') throw e;
  }
}

/** Recursively deletes everything below a folder (used by account deletion). */
export async function deleteFolder(path: string): Promise<void> {
  const walk = async (folder: StorageReference): Promise<void> => {
    const { items, prefixes } = await listAll(folder);
    await Promise.all(items.map((i) => deleteObject(i).catch(() => undefined)));
    await Promise.all(prefixes.map(walk));
  };
  await walk(ref(storage, path));
}

/** Random UUID v4 for client-generated ids (so uploads and rows share the same id). */
export function newId(): string {
  return randomUUID();
}
