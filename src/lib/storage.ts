import { randomUUID } from 'expo-crypto';
import * as ImageManipulator from 'expo-image-manipulator';

import { FILE_RULES, parseFileKey, sanitizeFileName, type FileKind } from './fileKeys';
import { deleteFile as deleteFileRequest, signFileUrl } from './api/generated/sdk.gen';
import './apiClient';
import { API_URL, ApiError, authHeader } from './http';

export type { FileKind };

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

/** Avatars have their own (image-only, smaller) rules; everything else is a document. */
export const kindOfKey = (key: string): FileKind => (parseFileKey(key)?.kind === 'avatar' ? 'avatar' : 'document');

export function validateFile(file: Pick<PickedFile, 'mimeType' | 'size'>, kind: FileKind): void {
  const { maxBytes, mimeTypes } = FILE_RULES[kind];
  if (!mimeTypes.includes(file.mimeType.toLowerCase())) throw new FileValidationError('unsupported-type', `Unsupported file type: ${file.mimeType}`);
  if (file.size != null && file.size > maxBytes) throw new FileValidationError('too-large', `File exceeds ${maxBytes / 1024 / 1024} MB`);
}

/**
 * Compresses images (max 2000 px / 512 px for avatars) and converts HEIC (and anything else) to JPEG.
 * PDFs pass through untouched. Size is re-measured after compression.
 */
export async function prepareFile(file: PickedFile, kind: FileKind): Promise<PickedFile> {
  validateFile({ mimeType: file.mimeType, size: undefined }, kind);
  let result = file;
  if (FILE_RULES.avatar.mimeTypes.includes(file.mimeType.toLowerCase())) { // avatars accept exactly the image types
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
  // PUT to the Worker (issue #7 §6): XHR rather than fetch so upload progress still works.
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
  return (await signFileUrl({ body: { key: storagePath } })).data!.url;
}

/** Idempotent on the Worker. */
export const deleteFile = async (storagePath: string): Promise<void> => {
  await deleteFileRequest({ path: { key: storagePath } });
};

export function newId(): string {
  return randomUUID();
}
