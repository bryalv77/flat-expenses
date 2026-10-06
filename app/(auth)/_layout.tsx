import { Stack } from 'expo-router';

import { backChevronOptions } from '@/components/ui';
import { useT } from '@/i18n';
import { useTheme } from '@/theme';

export default function AuthLayout() {
  const { colors } = useTheme();
  const { t } = useT();
  return (
    <Stack
      screenOptions={{
        ...backChevronOptions,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.tint,
        headerTitle: '',
        headerBackTitle: t('common.back'),
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="welcome" options={{ headerShown: false }} />
    </Stack>
  );
}
