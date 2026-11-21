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

describe('initAnalytics with the Worker API as backend', () => {
  it('never initialises: no third-party analytics without a consent banner', async () => {
    jest.resetModules();
    jest.doMock('./http', () => ({ USE_API: true }));
    jest.doMock('./appMode', () => ({ loadAppMode: jest.fn().mockResolvedValue('cloud') }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Jest's VM rejects dynamic import()
    const { initAnalytics: init } = require('./analytics') as typeof import('./analytics');
    await init(app);
    expect(mockGetAnalytics).not.toHaveBeenCalled();
  });
});
