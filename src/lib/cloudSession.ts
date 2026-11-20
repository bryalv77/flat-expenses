import { USE_API } from './http';
import { tokenStorage } from './tokenStorage';

/**
 * Whether a cloud session is already persisted on this device. Used at startup to restore a cloud
 * account instead of falling back to local mode (the default). API mode keeps the session token in
 * SecureStore; Firebase mode restores its own session inside the provider, so a fresh install starts local.
 */
export async function hasCloudSession(): Promise<boolean> {
  if (!USE_API) return false;
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
