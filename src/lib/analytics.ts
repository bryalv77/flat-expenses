import type { FirebaseApp } from 'firebase/app';
import { Platform } from 'react-native';

import { loadAppMode } from './appMode';

/** Analytics is web-only and only when the browser supports it. Never throws. */
export async function initAnalytics(app: FirebaseApp): Promise<void> {
  if (Platform.OS !== 'web') return;
  try {
    // Privacy: never in local mode. Reads storage because this runs at module load, before the mode gate.
    if ((await loadAppMode()) === 'local') return;
    const { getAnalytics, isSupported } = await import('firebase/analytics');
    if (await isSupported()) getAnalytics(app);
  } catch {
    // Analytics is optional.
  }
}
