import { clearPendingSync, markPendingSync } from '@/features/sync/pending';
import { signOutOfCloud } from '@/lib/apiAuth';
import { saveAppMode } from '@/lib/appMode';
import { queryClient } from '@/lib/queryClient';
import { createSubscribers } from '@/lib/subscribers';
import { useUiStore } from '@/lib/uiStore';

// Tree reset: the root layout keys its providers on this counter, so a bump remounts everything (providers, api consumers).
let treeKey = 0;
const subscribers = createSubscribers();
export const getTreeKey = () => treeKey;
export const subscribeTreeReset = subscribers.subscribe;

async function switchTo(mode: 'local' | 'cloud') {
  await saveAppMode(mode);
  queryClient.clear();
  useUiStore.getState().setActiveHouseId(null);
  treeKey += 1;
  subscribers.notify();
}

/** Cloud and local never mix: sign out of cloud (and drop its token) first, then switch and remount. */
export async function enterLocalMode() {
  await signOutOfCloud();
  await clearPendingSync();
  await switchTo('local');
}

/** "Log in" from local mode: flag the local→cloud sync first so a crash mid-login still resumes it. */
export async function startCloudLogin() {
  await markPendingSync();
  await switchTo('cloud');
}

/**
 * Startup fallback: switch to local without any cloud call. Used when the auth provider restores no
 * valid session, so the app opens in local mode instead of sitting on a login screen (or a spinner).
 */
export const startInLocalMode = () => switchTo('local');
