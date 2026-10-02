import { Pressable } from 'react-native';

import { haptics } from '@/lib/haptics';
import { MIN_TOUCH, spacing, useTheme } from '@/theme';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
  color?: string;
}

export function Chip({ label, selected, onPress, icon, color }: ChipProps) {
  const { colors } = useTheme();
  const accent = color ?? colors.tint;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      hitSlop={{ top: 4, bottom: 4 }}
      onPress={() => {
        haptics.selection();
        onPress?.();
      }}
      style={{
        minHeight: MIN_TOUCH - 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        paddingHorizontal: spacing.md,
        borderRadius: 999,
        backgroundColor: selected ? accent : colors.secondaryFill,
      }}
    >
      {icon ? <Icon name={icon} size={14} color={selected ? '#FFFFFF' : accent} /> : null}
      <Text variant="subhead" style={{ color: selected ? '#FFFFFF' : colors.label, fontWeight: selected ? '600' : '400' }}>
        {label}
      </Text>
    </Pressable>
  );
}
