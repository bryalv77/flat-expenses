import { type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { radii, spacing, useTheme } from '@/theme';

export function Card({ children, style, padded = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[{ backgroundColor: colors.grouped, borderRadius: radii.lg, padding: padded ? spacing.lg : 0, marginBottom: spacing.lg }, style]}>
      {children}
    </View>
  );
}
