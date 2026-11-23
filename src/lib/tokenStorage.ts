import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { TokenStorage } from './authClient';

const KEY = 'costospiso.session-token';

// SecureStore (Keychain / Keystore) on iOS and Android. It does not exist on web, where localStorage is the equivalent
const web: TokenStorage = {
  get: async () => {
    try { return globalThis.localStorage?.getItem(KEY) ?? null; } catch { return null; }
  },
  set: async (t) => {
    try { globalThis.localStorage?.setItem(KEY, t); } catch { /* private mode: the session just won't persist */ }
  },
  clear: async () => {
    try { globalThis.localStorage?.removeItem(KEY); } catch { /* nothing to clear */ }
  },
};

const native: TokenStorage = {
  get: () => SecureStore.getItemAsync(KEY),
  set: (t) => SecureStore.setItemAsync(KEY, t),
  clear: () => SecureStore.deleteItemAsync(KEY),
};

export const tokenStorage: TokenStorage = Platform.OS === 'web' ? web : native;
