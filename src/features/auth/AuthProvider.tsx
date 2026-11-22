import type { ReactNode } from 'react';

import { getAppMode } from '@/lib/appMode';
import { USE_API } from '@/lib/http';

import { ApiAuthProvider } from './ApiAuthProvider';
import { FirebaseAuthProvider } from './FirebaseAuthProvider';
import { LocalAuthProvider } from './LocalAuthProvider';

const CloudAuthProvider = USE_API ? ApiAuthProvider : FirebaseAuthProvider;

// The mode is loaded before the first render; switching remounts the tree (see appModeSwitch).
export function AuthProvider({ children }: { children: ReactNode }) {
  const Provider = getAppMode() === 'local' ? LocalAuthProvider : CloudAuthProvider;
  return <Provider>{children}</Provider>;
}
