const calls: string[] = [];
jest.mock('@/lib/appMode', () => ({ saveAppMode: jest.fn(async (m: string) => void calls.push(`save:${m}`)) }));
jest.mock('@/lib/queryClient', () => ({ queryClient: { clear: jest.fn(() => void calls.push('qc.clear')) } }));
jest.mock('@/lib/uiStore', () => ({ useUiStore: { getState: () => ({ setActiveHouseId: () => void calls.push('house:null') }) } }));
jest.mock('@/lib/apiAuth', () => ({
  getApiAuth: () => ({
    client: { signOut: async () => void calls.push('cloud.signOut') },
    clearToken: async () => void calls.push('clearToken'),
  }),
}));
jest.mock('@/features/sync/pending', () => ({
  clearPendingSync: async () => void calls.push('pendingSync:clear'),
}));

import { enterLocalMode, getTreeKey, leaveLocalMode, startInLocalMode, subscribeTreeReset } from './appModeSwitch';

beforeEach(() => (calls.length = 0));

describe('appModeSwitch', () => {
  it('entering local signs out of cloud, clears the pending sync flag and the token before saving the mode', async () => {
    await enterLocalMode();
    expect(calls).toEqual(['cloud.signOut', 'clearToken', 'pendingSync:clear', 'save:local', 'qc.clear', 'house:null']);
  });

  it('leaving local saves cloud and clears caches', async () => {
    await leaveLocalMode();
    expect(calls).toEqual(['save:cloud', 'qc.clear', 'house:null']);
  });

  it('startInLocalMode switches to local without any cloud call', async () => {
    await startInLocalMode();
    expect(calls).toEqual(['save:local', 'qc.clear', 'house:null']);
  });

  it('resets the tree (key changes, subscribers notified)', async () => {
    const seen = jest.fn();
    const unsub = subscribeTreeReset(seen);
    const k = getTreeKey();
    await enterLocalMode();
    expect(getTreeKey()).toBe(k + 1);
    expect(seen).toHaveBeenCalledTimes(1);
    unsub();
  });
});
