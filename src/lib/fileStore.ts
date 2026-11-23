import { getAppMode } from './appMode';
import { localFileStore } from './fileStore.local';
import { deleteFile, deleteFolder, getFileUrl, uploadFile, type PickedFile, type UploadedFile } from './storage';

export interface FileStore {
  upload(storagePath: string, file: PickedFile, onProgress?: (fraction: number) => void): Promise<UploadedFile>;
  getUrl(storagePath: string): Promise<string>;
  delete(storagePath: string): Promise<void>;
  deleteFolder(path: string): Promise<void>;
  /** Keys under a prefix, recursively. Local stores only (startup orphan sweep). */
  list?(prefix: string): Promise<string[]>;
}

// Wraps the existing storage.ts functions (the Worker).
const cloudFileStore: FileStore = {
  upload: (p, f, cb) => uploadFile(p, f, cb),
  getUrl: (p) => getFileUrl(p),
  delete: (p) => deleteFile(p),
  deleteFolder: (p) => deleteFolder(p),
};

export const getFileStore = (): FileStore => (getAppMode() === 'local' ? localFileStore : cloudFileStore);
