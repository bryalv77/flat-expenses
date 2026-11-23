import { randomUUID } from 'expo-crypto';
import * as ImageManipulator from 'expo-image-manipulator';

import { parseFileKey, type FileKind } from './fileKeys';
import { API_URL, ApiError, authHeader, request } from './http';
import { DOCUMENT_MIME_TYPES, IMAGE_MIME_TYPES, MAX_AVATAR_BYTES, MAX_FILE_BYTES } from './limits';

export type { FileKind };

const MAX_BYTES: Record<FileKind, number> = { avatar: MAX_AVATAR_BYTES, document: MAX_FILE_BYTES, bill: MAX_FILE_BYTES };

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

type FileErrorCode = 'unsupported-type' | 'too-large';
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

function isImageType(mimeType: string): boolean {
  return (IMAGE_MIME_TYPES as readonly string[]).includes(mimeType.toLowerCase());
}

/** Avatars have their own (image-only, smaller) rules; everything else is a document. */
export const kindOfKey = (key: string): FileKind => (parseFileKey(key)?.kind === 'avatar' ? 'avatar' : 'document');

export function validateFile(file: Pick<PickedFile, 'mimeType' | 'size'>, kind: FileKind): void {
  const type = file.mimeType.toLowerCase();
  const allowed = kind === 'avatar' ? isImageType(type) : (DOCUMENT_MIME_TYPES as readonly string[]).includes(type);
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
  validateFile({ mimeType: file.mimeType, size: blob.size }, kindOfKey(storagePath));
  return uploadToApi(storagePath, file, blob, onProgress);
}

/** PUT to the Worker (issue #7 §6). XHR rather than fetch so upload progress still works. */
async function uploadToApi(storagePath: string, file: PickedFile, blob: Blob, onProgress?: (fraction: number) => void): Promise<UploadedFile> {
  const headers = await authHeader();
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', `${API_URL}/api/files/${storagePath}`);
    Object.entries({ ...headers, 'content-type': file.mimeType }).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.upload.onprogress = (e) => onProgress?.(e.lengthComputable && e.total > 0 ? e.loaded / e.total : 0);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      console.error('upload failed', storagePath, xhr.status, xhr.responseText);
      reject(new ApiError(xhr.status, (JSON.parse(xhr.responseText || '{}') as { error?: string }).error ?? `http_${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('Network error while uploading'));
    xhr.send(blob);
  });
  return { storagePath, fileName: sanitizeFileName(file.name), mimeType: file.mimeType, sizeBytes: blob.size };
}

/** Download URL for a stored path; the Worker only signs links for house members. */
export async function getFileUrl(storagePath: string): Promise<string> {
  // <Image> can't send an Authorization header, so the Worker hands out a signed link (valid 1 h, like the 50 min cache in useFileUrl).
  return (await request<{ url: string }>('POST', '/api/files/sign', { key: storagePath })).url;
}

export const deleteFile = (storagePath: string): Promise<void> => request('DELETE', `/api/files/${storagePath}`); // idempotent on the Worker

export function newId(): string {
  return randomUUID();
}
