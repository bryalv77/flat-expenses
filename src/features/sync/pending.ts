import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Marks that the user entered cloud login from local mode and, once signed in, must resolve the
 * local→cloud sync (upload local data, or discard it in favour of their cloud data). Persisted so a
 * crash mid-login resumes the sync on the next launch instead of silently dropping local data.
 */
const KEY = 'costos-piso.pendingCloudSync';

let pending = false;
const listeners = new Set<() => void>();

export const getPendingSync = (): boolean => pending;
export function subscribePendingSync(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

function setPending(value: boolean) {
  pending = value;
  listeners.forEach((fn) => fn());
}

/** Reads the persisted flag once at startup (before the first render, like `loadAppMode`). */
export async function loadPendingSync(): Promise<void> {
  try {
    pending = (await AsyncStorage.getItem(KEY)) === '1';
  } catch {
    pending = false;
  }
}

/** Called when the user taps "Log in" from local mode. */
export async function markPendingSync(): Promise<void> {
  setPending(true);
  try {
    await AsyncStorage.setItem(KEY, '1');
  } catch {
    /* in-memory flag is enough for this session */
  }
}

/** Called when the sync resolves (uploaded, discarded, or the user went back to local mode). */
export async function clearPendingSync(): Promise<void> {
  setPending(false);
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
