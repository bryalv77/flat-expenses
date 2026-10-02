import { type ReactNode, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MAX_CONTENT_WIDTH, radii, spacing, useTheme } from '@/theme';

import { Text } from './Text';

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

export function BottomSheet({ visible, onClose, title, children }: BottomSheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(0);

  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    if (visible) {
      progress.value = withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) });
    } else {
      progress.value = withTiming(0, { duration: 200 }, (done) => {
        if (done) runOnJS(setMounted)(false);
      });
    }
  }, [visible, progress]);

  const backdrop = useAnimatedStyle(() => ({ opacity: progress.value }));
  const sheet = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - progress.value) * 420 }], opacity: progress.value === 0 ? 0 : 1 }));

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }, backdrop]}>
          <Pressable style={styles.fill} onPress={onClose} accessibilityLabel="Cerrar" />
        </Animated.View>
        <View style={styles.bottom} pointerEvents="box-none">
          <Animated.View
            accessibilityViewIsModal
            style={[styles.sheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + spacing.lg }, sheet]}
          >
            <View style={[styles.grabber, { backgroundColor: colors.tertiaryLabel }]} />
            {title ? (
              <Text variant="headline" style={styles.title} accessibilityRole="header">
                {title}
              </Text>
            ) : null}
            {children}
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  bottom: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'flex-end', alignItems: 'center' },
  sheet: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, paddingHorizontal: spacing.lg, maxHeight: '90%' },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginVertical: spacing.sm },
  title: { textAlign: 'center', marginBottom: spacing.md },
});
