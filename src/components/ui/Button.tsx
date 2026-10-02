import { ActivityIndicator, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { haptics } from '@/lib/haptics';
import { MIN_TOUCH, radii, spacing, useTheme } from '@/theme';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'filled' | 'tinted' | 'plain';
  destructive?: boolean;
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({ title, onPress, variant = 'filled', destructive, loading, disabled, icon, fullWidth = true, style }: ButtonProps) {
  const { colors } = useTheme();
  const base = destructive ? colors.red : colors.tint;
  const bg = variant === 'filled' ? base : variant === 'tinted' ? `${base}26` : 'transparent';
  const fg = variant === 'filled' ? colors.tintOnFilled : base;
  const inactive = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={() => {
        haptics.light();
        onPress();
      }}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: bg, opacity: inactive ? 0.45 : pressed ? 0.7 : 1, alignSelf: fullWidth ? 'stretch' : 'flex-start' },
        variant === 'plain' && { paddingHorizontal: spacing.sm },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={18} color={fg} /> : null}
          <Text variant="headline" style={{ color: fg }}>
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: MIN_TOUCH + 6, borderRadius: radii.md, paddingHorizontal: spacing.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
});
