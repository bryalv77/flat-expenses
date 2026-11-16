import { signOut as firebaseSignOut } from 'firebase/auth';

import { clearPendingSync } from '@/features/sync/pending';
import { getApiAuth } from '@/lib/apiAuth';
import { saveAppMode } from '@/lib/appMode';
import { auth } from '@/lib/firebase';
import { USE_API } from '@/lib/http';
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

async function signOutOfCloud() {
  if (USE_API) {
    const { client, clearToken } = getApiAuth();
    await client.signOut().catch(() => undefined); // offline: the token is still dropped locally
    await clearToken();
  } else {
    await firebaseSignOut(auth).catch(() => undefined);
  }
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
