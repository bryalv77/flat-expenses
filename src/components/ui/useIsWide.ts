import { useWindowDimensions } from 'react-native';

import { WIDE_BREAKPOINT } from '@/theme/tokens';

export function useIsWide(): boolean {
  const { width } = useWindowDimensions();
  return width >= WIDE_BREAKPOINT;
}
