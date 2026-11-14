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
  await saveAppMode('cloud');
  mockStore.clear();
});

describe('appMode', () => {
  it('defaults to cloud', async () => {
    expect(await loadAppMode()).toBe('cloud');
    expect(getAppMode()).toBe('cloud');
  });

  it('saves local, getter reflects it, and it survives a re-read', async () => {
    await saveAppMode('local');
    expect(getAppMode()).toBe('local');
    expect(await loadAppMode()).toBe('local');
  });

  it('ignores garbage in storage', async () => {
    mockStore.set('appMode', 'nope');
    expect(await loadAppMode()).toBe('cloud');
  });

  it('falls back to cloud when storage fails', async () => {
    await saveAppMode('local');
    mockFailing = true;
    expect(await loadAppMode()).toBe('cloud');
    expect(getAppMode()).toBe('cloud');
  });
});
