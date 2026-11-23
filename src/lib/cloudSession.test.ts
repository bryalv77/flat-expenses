jest.mock('@/lib/http', () => ({ API_URL: 'https://api.test' }));
jest.mock('@/lib/tokenStorage', () => ({
  tokenStorage: { get: jest.fn(() => new Promise<string | null>(() => undefined)) }, // never resolves
}));

import { hasCloudSession } from './cloudSession';

describe('hasCloudSession', () => {
  it('resolves false quickly when SecureStore hangs, so startup can proceed in local mode', async () => {
    jest.useFakeTimers();
    const result = hasCloudSession();
    await jest.advanceTimersByTimeAsync(2000);
    await expect(result).resolves.toBe(false);
    jest.useRealTimers();
  });
});
