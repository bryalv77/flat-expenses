import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { useT } from '@/i18n';
import { MIN_TOUCH, useTheme } from '@/theme';

import { Icon } from './Icon';

/** Chevron back button for stack headers (same look on iOS, Android and web instead of the platform arrow). */
export function HeaderBack({ tintColor }: { tintColor?: string }) {
  const { colors } = useTheme();
  const { t } = useT();
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('common.back')}
      hitSlop={8}
      onPress={() => router.back()}
      style={{ minWidth: MIN_TOUCH - 8, minHeight: MIN_TOUCH, alignItems: 'flex-start', justifyContent: 'center' }}
    >
      <View style={{ transform: [{ rotate: '180deg' }] }}>
        <Icon name="chevronRight" size={24} color={tintColor ?? colors.tint} />
      </View>
    </Pressable>
  );
}

/** Spread into a Stack's `screenOptions`. */
export const backChevronOptions = {
  headerLeft: ({ canGoBack, tintColor }: { canGoBack?: boolean; tintColor?: unknown }) =>
    canGoBack ? <HeaderBack tintColor={typeof tintColor === 'string' ? tintColor : undefined} /> : null,
};
