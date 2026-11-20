import { View } from 'react-native';

import { Chip } from '@/components/ui';
import { LOCALES } from '@/i18n';
import { useUiStore } from '@/lib/uiStore';
import { spacing } from '@/theme';

/** Always-visible language picker for screens shown before Settings is reachable (welcome, first flat). */
export function LanguageChips() {
  const locale = useUiStore((s) => s.locale);
  const setLocale = useUiStore((s) => s.setLocale);
  return (
    <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, justifyContent: 'center' }}>
      {LOCALES.map((l) => (
        <Chip key={l.code} label={l.label} selected={l.code === locale} onPress={() => setLocale(l.code)} />
      ))}
    </View>
  );
}
