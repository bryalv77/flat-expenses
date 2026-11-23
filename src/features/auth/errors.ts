import type { TranslationKey } from '@/i18n';
import { NETWORK_ERROR } from '@/lib/authErrors';

const errorCode = (error: unknown): string =>
  typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : '';

/** Maps an auth error code (Better Auth's code, see lib/authErrors.ts) to a translation key. */
export function authErrorKey(error: unknown): TranslationKey {
  const code = errorCode(error);
  switch (code) {
    case 'INVALID_EMAIL_OR_PASSWORD':
    case 'INVALID_PASSWORD':
    case 'USER_NOT_FOUND':
    case 'INVALID_EMAIL':
      return 'auth.wrongCredentials';
    case 'USER_ALREADY_EXISTS':
    case 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL':
      return 'auth.emailInUse';
    case NETWORK_ERROR:
      return 'errors.network';
    case 'INVALID_TOKEN': // reset link expired, used or tampered with
      return 'account.resetLinkInvalid';
    default:
      return 'errors.generic';
  }
}

/** Wrong current password while re-authenticating (change password / delete account). */
export function reauthErrorKey(error: unknown): TranslationKey {
  const code = errorCode(error);
  if (code === 'INVALID_EMAIL_OR_PASSWORD' || code === 'INVALID_PASSWORD') return 'account.wrongPassword';
  return authErrorKey(error);
}
