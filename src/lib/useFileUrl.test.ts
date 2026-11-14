jest.mock('./fileStore', () => ({ getFileStore: jest.fn() }));
jest.mock('@tanstack/react-query', () => ({ useQuery: jest.fn() }));

import { getFileStore } from './fileStore';
import { resolveFileUrl } from './useFileUrl';

it('resolves through the active FileStore (local file URIs in local mode)', async () => {
  const getUrl = jest.fn().mockResolvedValue('file:///doc/files/a.png');
  (getFileStore as jest.Mock).mockReturnValue({ getUrl });
  await expect(resolveFileUrl('houses/h/a.png')).resolves.toBe('file:///doc/files/a.png');
  expect(getUrl).toHaveBeenCalledWith('houses/h/a.png');
});
