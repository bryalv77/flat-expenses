import { Stack } from 'expo-router';

import { useT } from '@/i18n';
import { useTheme } from '@/theme';

export default function OnboardingLayout() {
  const { colors } = useTheme();
  const { t } = useT();
  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.tint,
        headerTitle: '',
        headerBackTitle: t('common.back'),
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
