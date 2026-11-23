import { clearPendingSync } from '@/features/sync/pending';
import { signOutOfCloud } from '@/lib/apiAuth';
import { saveAppMode } from '@/lib/appMode';
import { queryClient } from '@/lib/queryClient';
import { useUiStore } from '@/lib/uiStore';

// Tree reset: the root layout keys its providers on this counter, so a bump remounts everything (providers, api consumers).
let treeKey = 0;
const listeners = new Set<() => void>();
export const getTreeKey = () => treeKey;
export function subscribeTreeReset(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

async function switchTo(mode: 'local' | 'cloud') {
  await saveAppMode(mode);
  queryClient.clear();
  useUiStore.getState().setActiveHouseId(null);
  treeKey += 1;
  listeners.forEach((fn) => fn());
}

/** Cloud and local never mix: sign out of cloud (and drop its token) first, then switch and remount. */
export async function enterLocalMode() {
  await signOutOfCloud();
  await clearPendingSync();
  await switchTo('local');
}

export const leaveLocalMode = () => switchTo('cloud');

/**
 * Startup fallback: switch to local without any cloud call. Used when the auth provider restores no
 * valid session, so the app opens in local mode instead of sitting on a login screen (or a spinner).
 */
export const startInLocalMode = () => switchTo('local');
