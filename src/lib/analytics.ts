import type { FirebaseApp } from 'firebase/app';
import { Platform } from 'react-native';

import { loadAppMode } from './appMode';
import { USE_API } from './http';

/** Analytics is web-only and only when the browser supports it. Never throws. */
export async function initAnalytics(app: FirebaseApp): Promise<void> {
  if (Platform.OS !== 'web') return;
  // Backed by our own API there is no Firebase project to report to, and there is no consent banner: no third-party analytics.
  if (USE_API) return;
  try {
    // Privacy: never in local mode. Reads storage because this runs at module load, before the mode gate.
    if ((await loadAppMode()) === 'local') return;
    const { getAnalytics, isSupported } = await import('firebase/analytics');
    if (await isSupported()) getAnalytics(app);
  } catch {
    // Analytics is optional.
  }
}
