
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

describe('local FileStore (web) list', () => {
  it('lists keys under a prefix', async () => {
    installFetch();
    const db = createTestDb();
    await migrate(db);
    const store = createWebFileStore(db);
    for (const k of ['houses/h1/a.png', 'houses/h1/sub/b.png', 'houses/h2/c.png']) await store.upload(k, pick(k.replace(/\//g, '_')));
    expect((await store.list!('houses/h1')).sort()).toEqual(['houses/h1/a.png', 'houses/h1/sub/b.png']);
    expect(await store.list!('')).toHaveLength(3);
  });
});
