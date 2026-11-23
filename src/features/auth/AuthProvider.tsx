import type { ReactNode } from 'react';

import { getAppMode } from '@/lib/appMode';

import { ApiAuthProvider } from './ApiAuthProvider';
import { LocalAuthProvider } from './LocalAuthProvider';

// The mode is loaded before the first render; switching remounts the tree (see appModeSwitch).
export function AuthProvider({ children }: { children: ReactNode }) {
  const Provider = getAppMode() === 'local' ? LocalAuthProvider : ApiAuthProvider;
  return <Provider>{children}</Provider>;
}
