import { View } from 'react-native';

import { spacing, useTheme } from '@/theme';

import { Icon } from './Icon';
import { Text } from './Text';

export type BadgeTone = 'neutral' | 'blue' | 'green' | 'red' | 'orange';

export function Badge({ label, tone = 'neutral', icon, color, small }: { label: string; tone?: BadgeTone; icon?: string; color?: string; small?: boolean }) {
  const { colors } = useTheme();
  const base = color ?? (tone === 'neutral' ? colors.gray : colors[tone]);
  return (
    <View
      style={{
        backgroundColor: `${base}26`,
        borderRadius: 999,
        paddingHorizontal: small ? 6 : spacing.sm,
        paddingVertical: small ? 1 : 2,
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
      }}
    >
      {icon ? <Icon name={icon} size={12} color={base} /> : null}
      <Text variant="caption" style={{ color: base, fontWeight: '600', ...(small ? { fontSize: 10, lineHeight: 14 } : null) }}>
        {label}
      </Text>
    </View>
  );
}
