import { useSyncExternalStore } from 'react';
import { useWindowDimensions } from 'react-native';

import { WIDE_BREAKPOINT } from '@/theme/tokens';

const subscribeNever = () => () => {};

/**
 * True once the app is mounted in the browser. The static web export is rendered without a window, so during
 * hydration the server snapshot (`false`) is used and the real layout is applied right after, which keeps the
 * first client render identical to the static HTML (no React #418).
 */
function useIsClient(): boolean {
  return useSyncExternalStore(subscribeNever, () => true, () => false);
}

export function useIsWide(): boolean {
  const { width } = useWindowDimensions();
  const isClient = useIsClient();
  return isClient && width >= WIDE_BREAKPOINT;
}
