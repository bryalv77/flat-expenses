jest.mock('@/lib/http', () => ({ USE_API: true }));
jest.mock('@/lib/tokenStorage', () => ({
  tokenStorage: { get: jest.fn(() => new Promise<string | null>(() => undefined)) }, // never resolves
}));

import { hasCloudSession } from './cloudSession';

describe('hasCloudSession', () => {
  it('resolves false quickly when SecureStore hangs, so startup can proceed in local mode', async () => {
    const started = Date.now();
    await expect(hasCloudSession()).resolves.toBe(false);
    expect(Date.now() - started).toBeLessThan(4000);
  });
});
