import { getAppMode } from './appMode';
import { localFileStore } from './fileStore.local';
import { getFileStore } from './fileStore';

jest.mock('./storage', () => ({ uploadFile: jest.fn(), getFileUrl: jest.fn(), deleteFile: jest.fn() }));
jest.mock('./appMode', () => ({ getAppMode: jest.fn() }));

jest.mock('./fileStore.local', () => ({ localFileStore: { tag: 'local' } }));

describe('getFileStore', () => {
  it('picks the local store in local mode and the cloud wrapper otherwise', () => {
    (getAppMode as jest.Mock).mockReturnValue('local');
    expect(getFileStore()).toBe(localFileStore);
    (getAppMode as jest.Mock).mockReturnValue('cloud');
    expect(getFileStore()).not.toBe(localFileStore);
  });
});
