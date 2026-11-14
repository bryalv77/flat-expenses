import { useQueryClient } from '@tanstack/react-query';
import {
  EmailAuthProvider,
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updatePassword,
  updateProfile,
  type User as FirebaseUser,
} from 'firebase/auth';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { api } from '@/lib/db';
import { auth, featureFlags } from '@/lib/firebase';
import { qk } from '@/lib/queryKeys';
import { deleteFolder } from '@/lib/storage';
import { useUiStore } from '@/lib/uiStore';

import { AuthContext, type AuthContextValue, type SignUpInput } from './AuthContext';

export function FirebaseAuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [profileReady, setProfileReady] = useState(false);
  /** While true, the sync effect must not create the User row (signUp does it with the chosen name). */
  const signingUp = useRef(false);

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setInitializing(false);
      if (!user) {
        setProfileReady(false);
        qc.clear();
      }
    });
  }, [qc]);

  // Ensure a `User` row exists on the first login (social providers, or sign-up on another device).
  useEffect(() => {
    if (!authUser || signingUp.current) return;
    let cancelled = false;
    (async () => {
      try {
        const me = await api.getMe();
        if (!me) {
          await api.upsertUser({
            email: authUser.email ?? '',
            displayName: authUser.displayName ?? authUser.email?.split('@')[0] ?? 'Roommie',
            locale: useUiStore.getState().locale,
          });
        } else {
          useUiStore.getState().setLocale(me.locale);
        }
        if (!cancelled) {
          await qc.invalidateQueries({ queryKey: qk.me });
          setProfileReady(true);
        }
      } catch {
        if (!cancelled) setProfileReady(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authUser, qc]);

  const signIn = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email.trim(), password);
  }, []);

  const signUp = useCallback(
    async ({ email, password, displayName, accountRole }: SignUpInput) => {
      signingUp.current = true;
      try {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await updateProfile(cred.user, { displayName: displayName.trim() });
        await api.upsertUser({
          email: email.trim(),
          displayName: displayName.trim(),
          locale: useUiStore.getState().locale,
          accountRole,
        });
        await qc.invalidateQueries({ queryKey: qk.me });
        setProfileReady(true);
      } finally {
        signingUp.current = false;
      }
    },
    [qc],
  );

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth);
    useUiStore.getState().setActiveHouseId(null);
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth, email.trim());
  }, []);

  const reauthWithPassword = useCallback(async (password: string) => {
    const user = auth.currentUser;
    if (!user?.email) throw new Error('No email account');
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
    return user;
  }, []);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      const user = await reauthWithPassword(currentPassword);
      await updatePassword(user, newPassword);
    },
    [reauthWithPassword],
  );

  const deleteAccount = useCallback(
    async (password?: string) => {
      const user = auth.currentUser;
      if (!user) return;
      if (password) await reauthWithPassword(password);
      await deleteFolder(`users/${user.uid}`).catch(() => undefined);
      await api.deleteMyAccountData();
      await deleteUser(user); // may throw auth/requires-recent-login (before touching Firebase user)
      useUiStore.getState().setActiveHouseId(null);
    },
    [reauthWithPassword],
  );

  const isPasswordAccount = Boolean(authUser?.providerData.some((p) => p.providerId === 'password'));

  const value = useMemo<AuthContextValue>(
    () => ({
      authUser,
      initializing,
      profileReady,
      features: { google: featureFlags.google, apple: featureFlags.apple },
      signIn,
      signUp,
      signOut,
      resetPassword,
      changePassword,
      deleteAccount,
      isPasswordAccount,
    }),
    [authUser, initializing, profileReady, signIn, signUp, signOut, resetPassword, changePassword, deleteAccount, isPasswordAccount],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
