import { getAppMode } from './appMode';
import { localFileStore } from './fileStore.local';
import { deleteFile, getFileUrl, uploadFile, type PickedFile, type UploadedFile } from './storage';

export interface FileStore {
  upload(storagePath: string, file: PickedFile, onProgress?: (fraction: number) => void): Promise<UploadedFile>;
  getUrl(storagePath: string): Promise<string>;
  delete(storagePath: string): Promise<void>;
  /** Local stores only: remove every key under a prefix. */
  deleteFolder?(path: string): Promise<void>;
  /** Local stores only: keys under a prefix, recursively (startup orphan sweep). */
  list?(prefix: string): Promise<string[]>;
}

// Wraps the existing storage.ts functions (the Worker).
const cloudFileStore: FileStore = { upload: uploadFile, getUrl: getFileUrl, delete: deleteFile };

export const getFileStore = (): FileStore => (getAppMode() === 'local' ? localFileStore : cloudFileStore);
