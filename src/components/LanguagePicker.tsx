import { useRef, useState } from 'react';
import { Modal, Pressable, useWindowDimensions, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { LOCALES, useT } from '@/i18n';
import { haptics } from '@/lib/haptics';
import { useUiStore } from '@/lib/uiStore';
import { MIN_TOUCH, radii, spacing, useTheme } from '@/theme';

/** Globe button that opens a dropdown of languages; for screens shown before Settings is reachable (welcome, first flat). */
export function LanguagePicker() {
  const { t } = useT();
  const { colors } = useTheme();
  const locale = useUiStore((s) => s.locale);
  const setLocale = useUiStore((s) => s.setLocale);
  const { width: screenWidth } = useWindowDimensions();
  const trigger = useRef<View>(null);
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);

  const open = () =>
    trigger.current?.measureInWindow((x, y, w, h) => {
      setAnchor({ top: y + h + spacing.xs, right: Math.max(spacing.md, screenWidth - (x + w)) });
    });

  return (
    <View style={{ alignItems: 'flex-end', paddingHorizontal: spacing.lg, marginBottom: spacing.lg }}>
      <Pressable
        ref={trigger}
        accessibilityRole="button"
        accessibilityLabel={t('profile.language')}
        onPress={open}
        style={{ width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: colors.secondaryFill }}
      >
        <Icon name="globe" size={22} color={colors.label} />
      </Pressable>
      <Modal transparent visible={anchor !== null} animationType="fade" onRequestClose={() => setAnchor(null)}>
        <Pressable accessibilityLabel={t('common.cancel')} style={{ flex: 1 }} onPress={() => setAnchor(null)}>
          {anchor ? (
            <View
              accessibilityRole="menu"
              style={{ position: 'absolute', top: anchor.top, right: anchor.right, minWidth: 180, borderRadius: radii.lg, overflow: 'hidden', backgroundColor: colors.grouped, borderWidth: 1, borderColor: colors.separator }}
            >
              {LOCALES.map((l) => (
                <Pressable
                  key={l.code}
                  accessibilityRole="menuitem"
                  accessibilityState={{ selected: l.code === locale }}
                  onPress={() => {
                    haptics.selection();
                    setLocale(l.code);
                    setAnchor(null);
                  }}
                  style={{ minHeight: MIN_TOUCH, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingHorizontal: spacing.md }}
                >
                  <Text variant="body">{l.label}</Text>
                  {l.code === locale ? <Icon name="check" size={18} color={colors.tint} /> : null}
                </Pressable>
              ))}
            </View>
          ) : null}
        </Pressable>
      </Modal>
    </View>
  );
}
