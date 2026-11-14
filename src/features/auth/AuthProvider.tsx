import type { ReactNode } from 'react';

import { getAppMode } from '@/lib/appMode';
import { USE_API } from '@/lib/http';

import { ApiAuthProvider } from './ApiAuthProvider';
import { FirebaseAuthProvider } from './FirebaseAuthProvider';
import { LocalAuthProvider } from './LocalAuthProvider';

const CloudAuthProvider = USE_API ? ApiAuthProvider : FirebaseAuthProvider;

/**
 * Local (SQLite, no account) when the saved mode is local, else Better Auth (Worker) when EXPO_PUBLIC_API_URL is set,
 * else Firebase Auth (issues #7, #8). The mode is loaded before the first render; switching remounts the tree.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const Provider = getAppMode() === 'local' ? LocalAuthProvider : CloudAuthProvider;
  return <Provider>{children}</Provider>;
}
