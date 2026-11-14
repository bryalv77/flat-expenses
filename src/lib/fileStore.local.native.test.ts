jest.mock('firebase/storage', () => ({}));
jest.mock('./firebase', () => ({ storage: {} }));
jest.mock('expo-file-system', () => require('./fileStore.local.fake').fakeExpoFs);

import { File } from 'expo-file-system';
import { installFetch, pick, runFileStoreContract } from './fileStore.local.contract';
import { resetFakeFs } from './fileStore.local.fake';
import { localFileStore } from './fileStore.local.native';

describe('local FileStore (native)', () => {
  runFileStoreContract(() => {
    resetFakeFs();
    return {
      store: localFileStore,
      read: async (path) => {
        const f = new File(await localFileStore.getUrl(path));
        return f.exists ? f.bytes() : undefined;
      },
    };
  });

  it('getUrl returns a file:// URI under the document directory', async () => {
    expect(await localFileStore.getUrl('houses/h1/a.png')).toBe('file:///doc/files/houses/h1/a.png');
  });

  it('list returns every stored key under a prefix, recursively', async () => {
    resetFakeFs();
    installFetch();
    for (const k of ['houses/h1/a.png', 'houses/h1/sub/b.png', 'houses/h2/c.png']) await localFileStore.upload(k, pick(k.replace(/\//g, '_')));
    expect((await localFileStore.list!('houses/h1')).sort()).toEqual(['houses/h1/a.png', 'houses/h1/sub/b.png']);
    expect(await localFileStore.list!('')).toHaveLength(3);
    expect(await localFileStore.list!('nope')).toEqual([]);
  });
});
