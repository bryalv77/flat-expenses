jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));
jest.mock('./appMode', () => ({ getAppMode: jest.fn(), loadAppMode: jest.fn() }));
const mockGetAnalytics = jest.fn();
jest.mock('firebase/analytics', () => ({ getAnalytics: (...a: unknown[]) => mockGetAnalytics(...a), isSupported: async () => true }));

import { initAnalytics } from './analytics';
import { loadAppMode } from './appMode';

const app = {} as never;
beforeEach(() => mockGetAnalytics.mockClear());

describe('initAnalytics', () => {
  it('never initialises in local mode (privacy)', async () => {
    (loadAppMode as jest.Mock).mockResolvedValue('local');
    await initAnalytics(app);
    expect(mockGetAnalytics).not.toHaveBeenCalled();
  });

  // Cloud init uses a dynamic import(), which Jest's VM rejects; only the local guard is testable here.
  it('does not throw in cloud mode', async () => {
    (loadAppMode as jest.Mock).mockResolvedValue('cloud');
    await expect(initAnalytics(app)).resolves.toBeUndefined();
  });
});
