import { BlurView } from 'expo-blur';
import { type ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MAX_CONTENT_WIDTH, spacing, useTheme } from '@/theme';

import { Text } from './Text';

/** The large title rendered inline at the top of scroll content. */
export function LargeTitle({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={styles.large}>
      <Text variant="largeTitle" accessibilityRole="header" style={{ flex: 1 }} numberOfLines={1}>
        {title}
      </Text>
      {right}
    </View>
  );
}

interface Props {
  title: string;
  scrollY: SharedValue<number>;
  right?: ReactNode;
}

/** Translucent compact bar that fades in once the large title scrolls away. */
export function LargeTitleHeader({ title, scrollY, right }: Props) {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const barStyle = useAnimatedStyle(() => ({ opacity: interpolate(scrollY.value, [20, 56], [0, 1], 'clamp') }));
  const height = 44 + insets.top;

  return (
    <Animated.View pointerEvents="box-none" style={[styles.bar, { height }, barStyle]}>
      <BlurView
        intensity={Platform.OS === 'web' ? 60 : 80}
        tint={scheme === 'dark' ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.hairline, { backgroundColor: colors.separator }]} />
      <View style={[styles.barRow, { paddingTop: insets.top }]}>
        <Text variant="headline" numberOfLines={1} style={{ textAlign: 'center' }}>
          {title}
        </Text>
        {right ? <View style={styles.barRight}>{right}</View> : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  large: { flexDirection: 'row', alignItems: 'center', paddingTop: spacing.xs, paddingBottom: spacing.md },
  bar: { position: 'absolute', top: 0, left: 0, right: 0 },
  barRow: { flex: 1, justifyContent: 'center', alignItems: 'center', maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center' },
  barRight: { position: 'absolute', right: spacing.lg, bottom: 0, top: 0, justifyContent: 'center' },
  hairline: { position: 'absolute', bottom: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth },
});
