// Client for the Worker API (issue #7). `EXPO_PUBLIC_API_URL` set => the app talks to it; unset => Firebase, as before.
// NOTE: Expo only inlines literal `process.env.EXPO_PUBLIC_*` accesses.
export const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, '') ?? '';
export const USE_API = API_URL !== '';
/** Where the hosted web app lives: password-reset emails send people to `${WEB_URL}/reset-password`. */
export const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL ?? 'https://app-cuota.devalv.com').replace(/\/+$/, '');

type TokenProvider = () => Promise<string | null>;
// Until Better Auth replaces Firebase Auth in the app (next step), a Better Auth session token can be
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

export async function request<T = void>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { ...(await authHeader()), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(res.status, err?.error ?? `http_${res.status}`);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const qs = (params: Record<string, string | undefined>) => {
  const q = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => e[1] !== undefined));
  return `?${q}`;
};
