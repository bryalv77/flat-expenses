import { enterLocalMode, getTreeKey, startCloudLogin, startInLocalMode, subscribeTreeReset } from './appModeSwitch';

const calls: string[] = [];
jest.mock('@/lib/appMode', () => ({ saveAppMode: jest.fn(async (m: string) => void calls.push(`save:${m}`)) }));
jest.mock('@/lib/queryClient', () => ({ queryClient: { clear: jest.fn(() => void calls.push('qc.clear')) } }));
jest.mock('@/lib/uiStore', () => ({ useUiStore: { getState: () => ({ setActiveHouseId: () => void calls.push('house:null') }) } }));
jest.mock('@/lib/apiAuth', () => ({ signOutOfCloud: async () => void calls.push('cloud.signOut') }));
jest.mock('@/features/sync/pending', () => ({
  clearPendingSync: async () => void calls.push('pendingSync:clear'),
  markPendingSync: async () => void calls.push('pendingSync:mark'),
}));

beforeEach(() => (calls.length = 0));

describe('appModeSwitch', () => {
  it('entering local signs out of cloud, clears the pending sync flag and the token before saving the mode', async () => {
    await enterLocalMode();
    expect(calls).toEqual(['cloud.signOut', 'pendingSync:clear', 'save:local', 'qc.clear', 'house:null']);
  });

  it('starting cloud login flags the pending sync before switching to cloud', async () => {
    await startCloudLogin();
    expect(calls).toEqual(['pendingSync:mark', 'save:cloud', 'qc.clear', 'house:null']);
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
