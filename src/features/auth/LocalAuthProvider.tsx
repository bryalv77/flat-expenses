// Local mode (issue #8): no account, no network. A fixed user; the user row itself is created by localApi.
import type { ReactNode } from 'react';

import { LOCAL_USER_ID } from '@/lib/api/local/ctx';

import { AuthContext, type AuthContextValue } from './AuthContext';

const unavailable = async (): Promise<never> => {
  throw new Error('Not available in local mode (no account)');
};

export const localAuthValue: AuthContextValue = {
  authUser: { uid: LOCAL_USER_ID, email: null, displayName: null },
  initializing: false,
  profileReady: true,
  signIn: unavailable,
  signUp: unavailable,
  signOut: unavailable,
  resetPassword: unavailable,
  changePassword: unavailable,
  deleteAccount: unavailable,
  isPasswordAccount: false,
};

export function LocalAuthProvider({ children }: { children: ReactNode }) {
  return <AuthContext.Provider value={localAuthValue}>{children}</AuthContext.Provider>;
}
