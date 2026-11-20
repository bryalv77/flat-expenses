const mockStore = new Map<string, string>();
let mockFailing = false;
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (k: string) => {
      if (mockFailing) throw new Error('boom');
      return mockStore.get(k) ?? null;
    },
    setItem: async (k: string, v: string) => {
      if (mockFailing) throw new Error('boom');
      mockStore.set(k, v);
    },
  },
}));

import { getAppMode, loadAppMode, saveAppMode } from './appMode';

beforeEach(async () => {
  mockFailing = false;
  mockStore.clear();
  // Reset the module's in-memory `current` back to the default between tests.
  await loadAppMode();
});

describe('appMode', () => {
  it('defaults to local (local-first: no login prompt)', async () => {
    expect(await loadAppMode()).toBe('local');
    expect(getAppMode()).toBe('local');
  });

  it('restores cloud when a cloud session is present', async () => {
    expect(await loadAppMode(async () => true)).toBe('cloud');
    expect(getAppMode()).toBe('cloud');
  });

  it('stays local when no cloud session is present', async () => {
    expect(await loadAppMode(async () => false)).toBe('local');
    expect(getAppMode()).toBe('local');
  });

  it('saves local, getter reflects it, and it survives a re-read', async () => {
    await saveAppMode('local');
    expect(getAppMode()).toBe('local');
    expect(await loadAppMode()).toBe('local');
  });

  it('a saved cloud choice wins over the session default', async () => {
    mockStore.set('appMode', 'cloud');
    expect(await loadAppMode(async () => false)).toBe('cloud');
  });

  it('ignores garbage in storage', async () => {
    mockStore.set('appMode', 'nope');
    expect(await loadAppMode()).toBe('local');
  });

  it('falls back to local when storage fails', async () => {
    await saveAppMode('cloud');
    mockFailing = true;
    expect(await loadAppMode()).toBe('local');
    expect(getAppMode()).toBe('local');
  });
});
