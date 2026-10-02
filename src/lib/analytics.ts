import type { FirebaseApp } from 'firebase/app';
import { Platform } from 'react-native';

/** Analytics is web-only and only when the browser supports it. Never throws. */
export async function initAnalytics(app: FirebaseApp): Promise<void> {
  if (Platform.OS !== 'web') return;
  try {
    const { getAnalytics, isSupported } = await import('firebase/analytics');
    if (await isSupported()) getAnalytics(app);
  } catch {
    // Analytics is optional.
  }
}
