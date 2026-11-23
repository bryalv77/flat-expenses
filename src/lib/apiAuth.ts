import { Platform } from 'react-native';

import { createApiAuth, type ApiAuth } from './authClient';
import { API_URL, setApiTokenProvider } from './http';
import { tokenStorage } from './tokenStorage';

let instance: ApiAuth | null = null;

/** Lazy singleton (only API mode builds it). Creating it also makes the data API send the session token. */
export function getApiAuth(): ApiAuth {
  if (!instance) {
    instance = createApiAuth(API_URL, tokenStorage, Platform.OS === 'web' ? undefined : 'costospiso://'); // = app.json "scheme"
    setApiTokenProvider(instance.getToken);
  }
  return instance;
}

/** Signs out on the server and always drops the local token, even offline. */
export async function signOutOfCloud(): Promise<void> {
  const { client, clearToken } = getApiAuth();
  await client.signOut().catch(() => undefined);
  await clearToken();
}
