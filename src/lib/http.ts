// Worker API settings (issue #7); the client itself is generated from openapi.yaml (see apiClient.ts). `EXPO_PUBLIC_API_URL` empty => no cloud, the app only works in local mode.
// NOTE: Expo only inlines literal `process.env.EXPO_PUBLIC_*` accesses.
export const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, '') ?? '';
/** Where the hosted web app lives: password-reset emails send people to `${WEB_URL}/reset-password`. */
export const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL ?? 'https://app-cuota.devalv.com').replace(/\/+$/, '');

type TokenProvider = () => Promise<string | null>;
// Default token source until apiAuth installs the SecureStore one; a Better Auth session token can be
// passed in for manual testing: EXPO_PUBLIC_API_DEV_TOKEN (dev only: anything EXPO_PUBLIC_ ships in the bundle).
let tokenProvider: TokenProvider = async () => process.env.EXPO_PUBLIC_API_DEV_TOKEN ?? null;
export const setApiTokenProvider = (fn: TokenProvider) => {
  tokenProvider = fn;
};

/** `message` is the server's error code (e.g. `CATEGORY_HAS_BILLS`), so callers can compare `e.message` like before. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    code: string,
  ) {
    super(code);
    this.name = 'ApiError';
  }
}

export const authHeader = async (): Promise<Record<string, string>> => {
  const token = await tokenProvider();
  return token ? { authorization: `Bearer ${token}` } : {};
};
