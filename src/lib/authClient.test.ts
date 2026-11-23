import { authErrorKey, reauthErrorKey } from '@/features/auth/errors';

import { NETWORK_ERROR, orNetworkError, toAuthError } from './authErrors';

describe('toAuthError', () => {
  it('keeps the Better Auth code, falls back to the HTTP status, and treats a missing error as a network failure', () => {
    expect((toAuthError({ code: 'SOMETHING_NEW', status: 500 }) as Error & { code: string }).code).toBe('SOMETHING_NEW');
    expect((toAuthError({ status: 502 }) as Error & { code: string }).code).toBe('http_502');
    expect((toAuthError(undefined) as Error & { code: string }).code).toBe(NETWORK_ERROR);
  });
});

describe('error codes reach the right translation', () => {
  it('maps Better Auth errors through to keys the UI already has', () => {
    expect(authErrorKey(toAuthError({ code: 'INVALID_TOKEN', status: 400 }))).toBe('account.resetLinkInvalid');
    expect(authErrorKey(toAuthError({ code: 'INVALID_EMAIL_OR_PASSWORD', status: 401 }))).toBe('auth.wrongCredentials');
    expect(authErrorKey(toAuthError({ code: 'USER_ALREADY_EXISTS', status: 422 }))).toBe('auth.emailInUse');
    expect(authErrorKey(toAuthError(undefined))).toBe('errors.network');
    expect(reauthErrorKey(toAuthError({ code: 'INVALID_PASSWORD', status: 400 }))).toBe('account.wrongPassword');
  });
});

describe('orNetworkError', () => {
  it('returns the result, or turns a thrown request failure into a network error', async () => {
    await expect(orNetworkError(async () => 42)).resolves.toBe(42);
    await expect(orNetworkError(async () => { throw new TypeError('fetch failed'); })).rejects.toMatchObject({ code: NETWORK_ERROR });
  });
});
