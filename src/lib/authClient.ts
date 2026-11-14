// Better Auth client for the Worker (issue #7 §4b). Bearer-token flow: the Worker's `bearer()` plugin returns the session
// token in the `set-auth-token` header on sign-in/up; we keep it in `TokenStorage` and send it on every call (including
// the data API, via setApiTokenProvider). No cookies, so native and web behave the same.
import { createAuthClient } from 'better-auth/client';

export interface TokenStorage {
  get: () => Promise<string | null>;
  set: (token: string) => Promise<void>;
  clear: () => Promise<void>;
}

/**
 * `origin`: Better Auth rejects requests without an Origin header (CSRF check, 403 MISSING_OR_NULL_ORIGIN). Browsers send it
 * on their own; React Native does not, so native passes the app scheme (it must be in the Worker's trustedOrigins).
 */
export function createApiAuth(baseURL: string, storage: TokenStorage, origin?: string) {
  let token: string | null = null; // memory copy so every request doesn't wait for SecureStore
  let loaded = false;
  const load = async () => {
    if (!loaded) {
      token = await storage.get();
      loaded = true;
    }
    return token;
  };

  const client = createAuthClient({
    baseURL,
    fetchOptions: {
      headers: origin ? { origin } : undefined,
      auth: { type: 'Bearer', token: async () => (await load()) ?? '' },
      onSuccess: async (ctx) => {
        const next = ctx.response.headers.get('set-auth-token');
        if (next) {
          token = next;
          loaded = true;
          await storage.set(next);
        }
      },
    },
  });

  return {
    client,
    getToken: load,
    /** Forget the token locally (sign-out, or the Worker rejected it). */
    clearToken: async () => {
      token = null;
      loaded = true;
      await storage.clear();
    },
  };
}
export type ApiAuth = ReturnType<typeof createApiAuth>;
