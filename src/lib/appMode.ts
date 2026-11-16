import AsyncStorage from '@react-native-async-storage/async-storage';

export type AppMode = 'local' | 'cloud';

const KEY = 'appMode';
// Local-first: a fresh install starts in local mode (no login prompt), so `local` is the default.
let current: AppMode = 'local';

/** Synchronous mode; valid after `loadAppMode()` has run once at startup. */
export const getAppMode = (): AppMode => current;

/**
 * Reads the saved mode. When nothing is saved yet, the app is local-first: it starts in local mode so
 * the user can use the app immediately, unless a cloud session is already present (then it restores it).
 * `hasCloudSession` is injected so this module stays free of native/network imports and stays testable.
 */
export async function loadAppMode(hasCloudSession: () => Promise<boolean> = async () => false): Promise<AppMode> {
  let stored: string | null = null;
  try {
    stored = await AsyncStorage.getItem(KEY);
  } catch {
    stored = null;
  }
  current = stored === 'local' || stored === 'cloud' ? stored : ((await hasCloudSession()) ? 'cloud' : 'local');
  return current;
}

export async function saveAppMode(mode: AppMode): Promise<void> {
  await AsyncStorage.setItem(KEY, mode);
  current = mode;
}
