import { NotImplementedError } from './api/local';
import { getAppMode } from './appMode';
import { deleteFile, deleteFolder, getFileUrl, uploadFile, type PickedFile, type UploadedFile } from './storage';

export interface FileStore {
  upload(storagePath: string, file: PickedFile, onProgress?: (fraction: number) => void): Promise<UploadedFile>;
  getUrl(storagePath: string): Promise<string>;
  delete(storagePath: string): Promise<void>;
  deleteFolder(path: string): Promise<void>;
}

// Wraps the existing storage.ts functions (Firebase Storage or the Worker).
const cloudFileStore: FileStore = {
  upload: (p, f, cb) => uploadFile(p, f, cb),
  getUrl: (p) => getFileUrl(p),
  delete: (p) => deleteFile(p),
  deleteFolder: (p) => deleteFolder(p),
};

// T8 replaces this with the native/web local store.
const fail = () => Promise.reject(new NotImplementedError('localFileStore'));
const localFileStore: FileStore = { upload: fail, getUrl: fail, delete: fail, deleteFolder: fail };

export const getFileStore = (): FileStore => (getAppMode() === 'local' ? localFileStore : cloudFileStore);
