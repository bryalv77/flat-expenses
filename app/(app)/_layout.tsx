import { Stack } from 'expo-router';
import { Platform } from 'react-native';

import { backChevronOptions } from '@/components/ui';
import { useT } from '@/i18n';
import { useTheme } from '@/theme';

export default function AppLayout() {
  const { colors } = useTheme();
  const { t } = useT();
  return (
    <Stack
      screenOptions={{
        ...backChevronOptions,
        headerTintColor: colors.tint,
        headerTitleStyle: { color: colors.label },
        headerStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.background },
        ...(Platform.OS === 'ios' ? { headerTransparent: false } : null),
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="categories/index" options={{ title: t('categories.title') }} />
      <Stack.Screen name="categories/new" options={{ title: t('categories.new'), presentation: 'modal' }} />
      <Stack.Screen name="categories/[id]" options={{ title: t('categories.title') }} />
      <Stack.Screen name="members/invite" options={{ title: t('house.invite'), presentation: 'modal' }} />
      <Stack.Screen name="members/new" options={{ title: t('hub.addGuest'), presentation: 'modal' }} />
      <Stack.Screen name="members/[id]" options={{ title: t('house.members') }} />
      <Stack.Screen name="import" options={{ title: 'Import' }} />
      <Stack.Screen name="payments/index" options={{ title: t('house.payments') }} />
    </Stack>
  );
}
