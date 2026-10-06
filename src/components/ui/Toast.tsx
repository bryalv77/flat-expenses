import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptics } from '@/lib/haptics';
import { radii, spacing, useTheme } from '@/theme';

import { Icon } from './Icon';
import { Text } from './Text';

type ToastKind = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}
interface ToastApi {
  show: (message: string, kind?: ToastKind) => void;
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const show = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = nextId.current++;
    if (kind === 'success') haptics.success();
    if (kind === 'error') haptics.error();
    setItems((prev) => [...prev, { id, message, kind }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 3200);
  }, []);

  const api = useMemo<ToastApi>(() => ({ show, success: (m) => show(m, 'success'), error: (m) => show(m, 'error') }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <View pointerEvents="none" style={[styles.host, { top: insets.top + spacing.sm }]}>
        {items.map((t) => (
          <Animated.View
            key={t.id}
            entering={FadeInUp.springify()}
            exiting={FadeOutUp}
            accessibilityLiveRegion="polite"
            style={[styles.toast, { backgroundColor: colors.elevated, borderColor: colors.separator }]}
          >
            <Icon name={t.kind === 'success' ? 'checkCircle' : t.kind === 'error' ? 'warning' : 'info'} size={20} color={t.kind === 'success' ? colors.green : t.kind === 'error' ? colors.red : colors.tint} />
            <Text variant="subhead" style={{ flexShrink: 1 }}>
              {t.message}
            </Text>
          </Animated.View>
        ))}
      </View>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: spacing.sm, zIndex: 1000 },
  toast: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radii.lg, borderWidth: StyleSheet.hairlineWidth, maxWidth: 520, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' },
});
