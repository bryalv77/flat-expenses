// Native auth initialisation with AsyncStorage persistence.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FirebaseApp } from 'firebase/app';
import * as firebaseAuth from 'firebase/auth';
import type { Auth, Persistence } from 'firebase/auth';

// `getReactNativePersistence` is only exposed through the "react-native" export condition, so
// it is missing from the default typings. It exists at runtime under Metro.
type RnAuthModule = {
  getReactNativePersistence: (storage: typeof AsyncStorage) => Persistence;
};

export function createAuth(app: FirebaseApp): Auth {
  try {
    const { getReactNativePersistence } = firebaseAuth as unknown as RnAuthModule;
    return firebaseAuth.initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    // Already initialised (fast refresh).
    return firebaseAuth.getAuth(app);
  }
}
