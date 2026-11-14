// Auth against the Worker (Better Auth), used when EXPO_PUBLIC_API_URL is set. Same context as the Firebase provider.
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { getApiAuth } from '@/lib/apiAuth';
import { orNetworkError, toAuthError } from '@/lib/authErrors';
import { api } from '@/lib/db';
import { qk } from '@/lib/queryKeys';
import { useUiStore } from '@/lib/uiStore';

import { AuthContext, type AuthContextValue, type AuthUser, type SignUpInput } from './AuthContext';

export function ApiAuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { client, clearToken } = getApiAuth();
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [initializing, setInitializing] = useState(true);
  /** uid whose profile has been loaded; `profileReady` is derived so signing out needs no state reset in an effect. */
  const [profileFor, setProfileFor] = useState<string | null>(null);
  const profileReady = authUser !== null && profileFor === authUser.uid;
  const signingUp = useRef(false);

  /** Asks the Worker who the stored token belongs to. A rejected token is dropped; a network error keeps it for next time. */
  const refresh = useCallback(async () => {
    // Offline at startup: keep the token for next time and show the signed-out screens meanwhile.
    const { data, error } = await orNetworkError(() => client.getSession()).catch(() => ({ data: null, error: { status: 0 } }));
    if (data?.user) {
      setAuthUser({ uid: data.user.id, email: data.user.email, displayName: data.user.name });
      return;
    }
    if (error?.status === 401 || (!error && !data)) await clearToken(); // a rejected token is dropped for good
    setAuthUser(null);
    qc.clear();
  }, [client, clearToken, qc]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refresh();
      if (!cancelled) setInitializing(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  // The account exists on the Worker from sign-up; this just loads the profile (locale) and unlocks the app.
  useEffect(() => {
    if (!authUser || signingUp.current) return;
    let cancelled = false;
    (async () => {
      try {
        const me = await api.getMe();
        if (me) useUiStore.getState().setLocale(me.locale);
        if (cancelled) return;
        await qc.invalidateQueries({ queryKey: qk.me });
        if (!cancelled && me) setProfileFor(authUser.uid);
      } catch {
        /* profile not loaded: the signed-in gate keeps waiting / the user can retry by reopening */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authUser, qc]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { error } = await orNetworkError(() => client.signIn.email({ email: email.trim(), password }));
      if (error) throw toAuthError(error);
      await refresh();
    },
    [client, refresh],
  );

  const signUp = useCallback(
    async ({ email, password, displayName, accountRole }: SignUpInput) => {
      signingUp.current = true;
      try {
        const { error } = await orNetworkError(() => client.signUp.email({ email: email.trim(), password, name: displayName.trim() }));
        if (error) throw toAuthError(error);
        await api.upsertUser({ email: email.trim(), displayName: displayName.trim(), locale: useUiStore.getState().locale, accountRole });
        await refresh();
        await qc.invalidateQueries({ queryKey: qk.me });
        const me = await api.getMe();
        if (me) setProfileFor(me.id);
      } finally {
        signingUp.current = false;
      }
    },
    [client, qc, refresh],
  );

  const signOut = useCallback(async () => {
    await client.signOut().catch(() => undefined); // offline: the token is still dropped locally below
    await clearToken();
    setAuthUser(null);
    qc.clear();
    useUiStore.getState().setActiveHouseId(null);
  }, [client, clearToken, qc]);

  // TODO(#7): needs a transactional email provider on the Worker (issue §13); until then the UI shows the generic error.
  const resetPassword = useCallback(async () => {
    throw Object.assign(new Error('PASSWORD_RESET_NOT_CONFIGURED'), { code: 'auth/not-supported' });
  }, []);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      const { error } = await orNetworkError(() => client.changePassword({ currentPassword, newPassword }));
      if (error) throw toAuthError(error); // INVALID_PASSWORD -> auth/wrong-password -> "wrong current password"
    },
    [client],
  );

  // The Worker verifies the password, deletes files, anonymises memberships and removes the account (worker/src/account.ts).
  // A last admin of a house gets code LAST_ADMIN (shown as the generic error for now). The session is gone once it succeeds.
  const deleteAccount = useCallback(
    async (password?: string) => {
      const { error } = await orNetworkError(() => client.deleteUser(password ? { password } : {}));
      if (error) throw toAuthError(error); // wrong password: INVALID_PASSWORD -> auth/wrong-password
      await clearToken();
      setAuthUser(null);
      qc.clear();
      useUiStore.getState().setActiveHouseId(null);
    },
    [client, clearToken, qc],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      authUser,
      initializing,
      profileReady,
      features: { google: false, apple: false }, // TODO(#7): Better Auth social providers
      signIn,
      signUp,
      signOut,
      resetPassword,
      changePassword,
      deleteAccount,
      isPasswordAccount: true,
    }),
    [authUser, initializing, profileReady, signIn, signUp, signOut, resetPassword, changePassword, deleteAccount],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
