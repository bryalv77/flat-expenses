// Pure helpers (no better-auth import, so jest can load them).

/** Code of an error whose request never got an answer (offline, DNS, refused). */
export const NETWORK_ERROR = 'NETWORK_ERROR';

export const toAuthError = (error: { code?: string; message?: string; status?: number } | null | undefined): Error => {
  // no code and no status = the request never reached the Worker
  const code = error?.code ?? (error?.status ? `http_${error.status}` : NETWORK_ERROR);
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
