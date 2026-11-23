import { Pressable, View } from 'react-native';

import { Icon } from '@/components/ui';
import { LanguagePicker } from '@/components/LanguagePicker';
import { useT } from '@/i18n';
import { haptics } from '@/lib/haptics';
import { MIN_TOUCH, spacing, useTheme } from '@/theme';

function ThemeToggle() {
  const { t } = useT();
  const { scheme, colors, setMode } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('profile.theme')}
      onPress={() => {
        haptics.selection();
        setMode(scheme === 'dark' ? 'light' : 'dark');
      }}
      style={{ width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: colors.secondaryFill }}
    >
      <Icon name={scheme === 'dark' ? 'sun' : 'moon'} size={20} color={colors.label} />
    </Pressable>
  );
}

/** Top-right header buttons for screens shown before Settings is reachable (welcome, first flat). */
export function HeaderControls() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <LanguagePicker />
      <ThemeToggle />
    </View>
  );
}
