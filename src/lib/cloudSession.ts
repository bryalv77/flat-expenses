import { API_URL } from './http';
import { orTimeout } from './timeout';
import { tokenStorage } from './tokenStorage';

/**
 * Whether a cloud session is already persisted on this device. Used at startup to restore a cloud
 * account instead of falling back to local mode (the default). The session token lives in SecureStore;
 * without EXPO_PUBLIC_API_URL there is no cloud, so the app starts local.
 */
export async function hasCloudSession(): Promise<boolean> {
  if (!API_URL) return false;
  // SecureStore (Keychain) can stall on iOS; a slow or failed read counts as "no session" so startup proceeds in local mode.
  return (await orTimeout(tokenStorage.get(), 2000, null)) != null;
}
