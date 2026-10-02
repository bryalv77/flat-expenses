import { View } from 'react-native';

import { spacing, useTheme } from '@/theme';

import { Text } from './Text';

export type BadgeTone = 'neutral' | 'blue' | 'green' | 'red' | 'orange';

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: BadgeTone }) {
  const { colors } = useTheme();
  const base = tone === 'neutral' ? colors.gray : colors[tone];
  return (
    <View style={{ backgroundColor: `${base}26`, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 2, alignSelf: 'flex-start' }}>
      <Text variant="caption" style={{ color: base, fontWeight: '600' }}>
        {label}
      </Text>
    </View>
  );
}
