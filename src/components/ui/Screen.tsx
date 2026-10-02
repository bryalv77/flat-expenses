import { type ReactNode } from 'react';
import { RefreshControl, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MAX_CONTENT_WIDTH, spacing, useTheme } from '@/theme';

import { LargeTitle, LargeTitleHeader } from './LargeTitleHeader';

export interface ScreenProps {
  children: ReactNode;
  /** Large collapsing title (tab roots). */
  title?: string;
  headerRight?: ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Extra bottom padding, e.g. for a floating tab bar. */
  bottomInset?: number;
  contentStyle?: StyleProp<ViewStyle>;
}

export function Screen({
  children,
  title,
  headerRight,
  scroll = true,
  refreshing,
  onRefresh,
  bottomInset = 0,
  contentStyle,
}: ScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });
  const topPad = title ? 44 + insets.top : spacing.lg;

  const inner = (
    <View style={[styles.column, { paddingBottom: insets.bottom + bottomInset + spacing.xxl }, contentStyle]}>
      {title ? <LargeTitle title={title} right={headerRight} /> : null}
      {children}
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {scroll ? (
        <Animated.ScrollView
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentInsetAdjustmentBehavior="never"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingTop: topPad, alignItems: 'center' }}
          refreshControl={
            onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.secondaryLabel} progressViewOffset={topPad} /> : undefined
          }
        >
          {inner}
        </Animated.ScrollView>
      ) : (
        <View style={{ flex: 1, paddingTop: topPad, alignItems: 'center' }}>{inner}</View>
      )}
      {title ? <LargeTitleHeader title={title} scrollY={scrollY} right={headerRight} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  column: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, paddingHorizontal: spacing.lg, flexGrow: 1 },
});
