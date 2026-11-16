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
    return (await tokenStorage.get()) != null;
  } catch {
    return false;
  }
}
