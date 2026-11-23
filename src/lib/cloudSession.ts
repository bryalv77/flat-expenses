import { API_URL } from './http';
import { tokenStorage } from './tokenStorage';

/**
 * Whether a cloud session is already persisted on this device. Used at startup to restore a cloud
 * account instead of falling back to local mode (the default). The session token lives in SecureStore;
 * without EXPO_PUBLIC_API_URL there is no cloud, so the app starts local.
 */
export async function hasCloudSession(): Promise<boolean> {
  if (!API_URL) return false;
  try {
    // SecureStore (Keychain) can stall on iOS; treat a slow read as "no session" so startup proceeds in local mode.
    const token = await Promise.race([
      tokenStorage.get(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
    ]);
    return token != null;
  } catch {
    return false;
  }
}
