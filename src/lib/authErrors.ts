// Pure helpers (no better-auth import, so jest can load them).

/** Better Auth error codes -> the `auth/*` codes that features/auth/errors.ts already maps to translations. */
const CODE_MAP: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: 'auth/invalid-credential',
  INVALID_EMAIL: 'auth/invalid-email',
  USER_NOT_FOUND: 'auth/user-not-found',
  INVALID_PASSWORD: 'auth/wrong-password',
  INVALID_TOKEN: 'auth/invalid-action-code', // reset link expired, used or tampered with
  USER_ALREADY_EXISTS: 'auth/email-already-in-use',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'auth/email-already-in-use',
};

export const toAuthError = (error: { code?: string; message?: string; status?: number } | null | undefined): Error => {
  // status 0 / undefined with no code = the request never reached the Worker (offline, DNS, CORS)
  const code = error?.code ? (CODE_MAP[error.code] ?? error.code) : error?.status ? `http_${error.status}` : 'auth/network-request-failed';
  return Object.assign(new Error(error?.message || code), { code });
};

/** The client throws (instead of returning `error`) when the request itself fails: offline, DNS, refused. Same code as `toAuthError(undefined)`. */
export const orNetworkError = async <T>(call: () => Promise<T>): Promise<T> => {
  try {
    return await call();
  } catch {
    throw toAuthError(undefined);
  }
};
