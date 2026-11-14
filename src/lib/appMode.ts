import AsyncStorage from '@react-native-async-storage/async-storage';

export type AppMode = 'local' | 'cloud';

const KEY = 'appMode';
let current: AppMode = 'cloud';

/** Synchronous mode; valid after `loadAppMode()` has run once at startup. */
export const getAppMode = (): AppMode => current;

export async function loadAppMode(): Promise<AppMode> {
  try {
    current = (await AsyncStorage.getItem(KEY)) === 'local' ? 'local' : 'cloud';
  } catch {
    current = 'cloud';
  }
  return current;
}

export async function saveAppMode(mode: AppMode): Promise<void> {
  await AsyncStorage.setItem(KEY, mode);
  current = mode;
}
