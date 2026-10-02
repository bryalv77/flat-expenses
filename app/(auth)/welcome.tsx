import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button, Icon, Screen, Text } from '@/components/ui';
import { SocialButtons } from '@/features/auth/SocialButtons';
import { useT } from '@/i18n';
import { radii, spacing, useTheme } from '@/theme';

export default function WelcomeScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const router = useRouter();
  return (
    <Screen>
      <View style={styles.hero}>
        <View style={[styles.logo, { backgroundColor: colors.tint }]}>
          <Icon name="home" size={44} color={colors.tintOnFilled} />
        </View>
        <Text variant="largeTitle" style={styles.center}>
          {t('auth.welcomeTitle')}
        </Text>
        <Text variant="body" color="secondaryLabel" style={styles.center}>
          {t('auth.welcomeSubtitle')}
        </Text>
      </View>
      <View style={styles.actions}>
        <Button title={t('auth.signUp')} onPress={() => router.push('/(auth)/sign-up')} />
        <Button title={t('auth.signIn')} variant="tinted" onPress={() => router.push('/(auth)/sign-in')} />
        <SocialButtons />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: spacing.md, paddingTop: 72, paddingBottom: spacing.xxxl },
  logo: { width: 96, height: 96, borderRadius: radii.xl, alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' },
  actions: { gap: spacing.sm, paddingHorizontal: spacing.lg },
});
