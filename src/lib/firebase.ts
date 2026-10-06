import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { type FirebaseApp, type FirebaseOptions, getApp, getApps, initializeApp } from 'firebase/app';
import { type Auth, connectAuthEmulator } from 'firebase/auth';
import {
  type Firestore,
  connectFirestoreEmulator,
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
} from 'firebase/firestore';
import { type FirebaseStorage, connectStorageEmulator, getStorage } from 'firebase/storage';
import { Platform } from 'react-native';

import { initAnalytics } from './analytics';
import { createAuth } from './authInit';

// NOTE: Expo only inlines literal `process.env.EXPO_PUBLIC_*` accesses (an alias like `const env = process.env` is not inlined on native).
// Native requests carry no HTTP referrer, so a key restricted to web referrers rejects them: set EXPO_PUBLIC_FIREBASE_API_KEY_NATIVE
// to a key without the referrer restriction (restricted by API instead) to use Firebase from iOS/Android.
const webApiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? 'AIzaSyA7La5uaZjWfCRQYglvVtQ5K8azOWZO-VU';
const nativeApiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY_NATIVE;

const firebaseConfig: FirebaseOptions = {
  apiKey: Platform.OS === 'web' ? webApiKey : (nativeApiKey ?? webApiKey),
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? 'costos-piso.firebaseapp.com',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? 'costos-piso',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? 'costos-piso.firebasestorage.app',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '292130454121',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '1:292130454121:web:1fb0edd8bcd5292eb040f8',
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID ?? 'G-8S760DB93E',
};

export const USE_EMULATORS = process.env.EXPO_PUBLIC_USE_EMULATORS === 'true';
const EMULATOR_HOST = process.env.EXPO_PUBLIC_EMULATOR_HOST ?? 'localhost';

export const featureFlags = {
  google: process.env.EXPO_PUBLIC_ENABLE_GOOGLE_SIGNIN === 'true',
  apple: process.env.EXPO_PUBLIC_ENABLE_APPLE_SIGNIN === 'true',
  googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '',
} as const;

const isFirstInit = getApps().length === 0;

export const app: FirebaseApp = isFirstInit ? initializeApp(firebaseConfig) : getApp();

// App Check (web, reCAPTCHA Enterprise): proves requests come from this site. Enabled only when a reCAPTCHA Enterprise site key is configured,
// and only worth enforcing in the console after it is live. Native needs App Attest / Play Integrity (EAS build).
const recaptchaSiteKey = process.env.EXPO_PUBLIC_RECAPTCHA_SITE_KEY;
if (isFirstInit && Platform.OS === 'web' && typeof document !== 'undefined' && recaptchaSiteKey && !USE_EMULATORS) {
  initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(recaptchaSiteKey), isTokenAutoRefreshEnabled: true });
}
export const auth: Auth = createAuth(app);
export const storage: FirebaseStorage = getStorage(app);

/**
 * Firestore with an in-memory cache only: TanStack Query owns client caching, we use one-shot reads
 * (no snapshot listeners) so reads stay cheap and predictable. React Native has no reliable WebChannel
 * streaming, so native auto-detects and falls back to long polling.
 */
export const db: Firestore = isFirstInit
  ? initializeFirestore(app, {
      localCache: memoryLocalCache(),
      ...(Platform.OS === 'web' ? {} : { experimentalAutoDetectLongPolling: true }),
    })
  : getFirestore(app);

if (isFirstInit) {
  if (USE_EMULATORS) {
    connectAuthEmulator(auth, `http://${EMULATOR_HOST}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, EMULATOR_HOST, 8080);
    connectStorageEmulator(storage, EMULATOR_HOST, 9199);
  }
  void initAnalytics(app);
}
