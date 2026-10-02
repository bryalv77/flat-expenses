// Web auth initialisation (Metro picks authInit.native.ts on iOS/Android).
import type { FirebaseApp } from 'firebase/app';
import { type Auth, browserLocalPersistence, getAuth, initializeAuth } from 'firebase/auth';

export function createAuth(app: FirebaseApp): Auth {
  try {
    return initializeAuth(app, { persistence: browserLocalPersistence });
  } catch {
    // Already initialised (fast refresh).
    return getAuth(app);
  }
}
