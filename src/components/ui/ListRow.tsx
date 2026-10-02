import { type ReactNode, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';

import { haptics } from '@/lib/haptics';
import { MIN_TOUCH, radii, spacing, useTheme } from '@/theme';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export interface SwipeAction {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  color?: string;
}

export interface ListRowProps {
  title: string;
  subtitle?: string;
  value?: string;
  icon?: IconName;
  iconColor?: string;
  /** Replaces the icon bubble (e.g. an Avatar). */
  leading?: ReactNode;
  trailing?: ReactNode;
  chevron?: boolean;
  destructive?: boolean;
  onPress?: () => void;
  swipeActions?: SwipeAction[];
  accessibilityLabel?: string;
}

export function ListRow({ title, subtitle, value, icon, iconColor, leading, trailing, chevron, destructive, onPress, swipeActions, accessibilityLabel }: ListRowProps) {
  const { colors } = useTheme();
  const ref = useRef<Swipeable>(null);

  const row = (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel ?? title}
      disabled={!onPress}
      onPress={() => {
        haptics.selection();
        onPress?.();
      }}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.secondaryFill : colors.grouped }]}
    >
      {leading ?? (icon ? (
        <View style={[styles.bubble, { backgroundColor: iconColor ?? colors.tint }]}>
          <Icon name={icon} size={18} color="#FFFFFF" />
        </View>
      ) : null)}
      <View style={styles.texts}>
        <Text variant="body" color={destructive ? 'red' : 'label'} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="footnote" color="secondaryLabel" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text variant="body" color="secondaryLabel" numberOfLines={1} style={styles.value}>
          {value}
        </Text>
      ) : null}
      {trailing}
      {chevron ? <Icon name="chevronRight" size={14} color={colors.tertiaryLabel} /> : null}
    </Pressable>
  );

  if (!swipeActions?.length) return row;

  return (
    <Swipeable
      ref={ref}
      overshootRight={false}
      onSwipeableOpen={() => haptics.medium()}
      renderRightActions={() => (
        <View style={styles.actions}>
          {swipeActions.map((a) => (
            <Pressable
              key={a.label}
              accessibilityRole="button"
              accessibilityLabel={a.label}
              onPress={() => {
                ref.current?.close();
                a.onPress();
              }}
              style={[styles.action, { backgroundColor: a.color ?? (a.destructive ? colors.red : colors.orange) }]}
            >
              <Text variant="subhead" style={{ color: '#FFFFFF', fontWeight: '600' }}>
                {a.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    >
      {row}
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: MIN_TOUCH + 4, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  bubble: { width: 30, height: 30, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1, justifyContent: 'center' },
  value: { maxWidth: '45%', textAlign: 'right' },
  actions: { flexDirection: 'row' },
  action: { width: 84, alignItems: 'center', justifyContent: 'center', borderRadius: radii.sm / 2 },
});
