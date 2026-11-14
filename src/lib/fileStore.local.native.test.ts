jest.mock('expo-file-system', () => require('./fileStore.local.fake').fakeExpoFs);

import { File } from 'expo-file-system';
import { runFileStoreContract } from './fileStore.local.contract';
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
});
