import type { TranslationKey } from '@/i18n';

/** Maps a Firebase/unknown error to a translation key. */
export function authErrorKey(error: unknown): TranslationKey {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      return 'auth.wrongCredentials';
    case 'auth/email-already-in-use':
      return 'auth.emailInUse';
    case 'auth/network-request-failed':
      return 'errors.network';
    case 'auth/requires-recent-login':
      return 'account.recentLogin';
    default:
      return 'errors.generic';
  }
}

/** Wrong current password while re-authenticating (change password / delete account). */
export function reauthErrorKey(error: unknown): TranslationKey {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : '';
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') return 'account.wrongPassword';
  return authErrorKey(error);
}
