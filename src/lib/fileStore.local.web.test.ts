jest.mock('firebase/storage', () => ({}));
jest.mock('./firebase', () => ({ storage: {} }));

import { migrate } from './api/local/migrate';
import { createTestDb } from './api/local/testDb';
import { installFetch, pick, runFileStoreContract } from './fileStore.local.contract';
import { createWebFileStore } from './fileStore.local.web';

const blobs = new Map<string, Blob>();
let n = 0;
Object.assign(URL, {
  createObjectURL: (b: Blob) => {
    const url = `blob:test/${n++}`;
    blobs.set(url, b);
    return url;
  },
  revokeObjectURL: (url: string) => void blobs.delete(url),
});

describe('local FileStore (web)', () => {
  runFileStoreContract(async () => {
    const db = createTestDb();
    await migrate(db);
    const store = createWebFileStore(db);
    return {
      store,
      read: async (path) => {
        try {
          return new Uint8Array(await blobs.get(await store.getUrl(path))!.arrayBuffer());
        } catch {
          return undefined;
        }
      },
    };
  });

  it('asks the browser for persistent storage once, best effort', async () => {
    installFetch();
    const persist = jest.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(globalThis, 'navigator', { value: { storage: { persist } }, configurable: true });
    const db = createTestDb();
    await migrate(db);
    const store = createWebFileStore(db);
    await store.upload('a/x.png', pick('x.png'));
    await store.upload('a/y.png', pick('y.png'));
    expect(persist).toHaveBeenCalledTimes(1);
  });
});
