jest.mock('./storage', () => ({ uploadFile: jest.fn(), getFileUrl: jest.fn(), deleteFile: jest.fn(), deleteFolder: jest.fn() }));
jest.mock('./appMode', () => ({ getAppMode: jest.fn() }));

import { getAppMode } from './appMode';
import { getFileStore } from './fileStore';
import * as mockStorage from './storage';

describe('getFileStore', () => {
  it('cloud mode wraps the storage.ts functions', async () => {
    (getAppMode as jest.Mock).mockReturnValue('cloud');
    const fs = getFileStore();
    await fs.upload('p', { uri: 'u', name: 'n', mimeType: 'image/png' });
    await fs.getUrl('p');
    await fs.delete('p');
    await fs.deleteFolder('f');
    expect(mockStorage.uploadFile).toHaveBeenCalledWith('p', expect.anything(), undefined);
    expect(mockStorage.getFileUrl).toHaveBeenCalledWith('p');
    expect(mockStorage.deleteFile).toHaveBeenCalledWith('p');
    expect(mockStorage.deleteFolder).toHaveBeenCalledWith('f');
  });

  it('local mode throws NotImplemented (until T8)', async () => {
    (getAppMode as jest.Mock).mockReturnValue('local');
    await expect(getFileStore().getUrl('p')).rejects.toThrow(/not implemented/i);
  });
});
