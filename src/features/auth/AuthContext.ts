import { createContext, useContext } from 'react';

import type { HouseRole } from '@/types/domain';

/** What the app needs to know about the signed-in account (a Firebase `User` satisfies it structurally). */
export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
}

export interface SignUpInput {
  email: string;
  password: string;
  displayName: string;
  accountRole?: HouseRole;
}

export interface AuthContextValue {
  /** Signed-in account, or null when signed out. */
  authUser: AuthUser | null;
  /** True until the persisted session has been restored (avoid redirect flicker). */
  initializing: boolean;
  /** True once the `User` row exists for the signed-in account. */
  profileReady: boolean;
  features: { google: boolean; apple: boolean };
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  /** Email/password accounts only; re-authenticates with the current password. */
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  /**
   * Deletes Storage files, anonymises DB rows and the account. Email accounts must pass their
   * password (re-authentication). Social accounts must have signed in recently, else an
   * `auth/requires-recent-login` error is thrown and the UI should ask the user to sign in again.
   */
  deleteAccount: (password?: string) => Promise<void>;
  isPasswordAccount: boolean;
}


export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
