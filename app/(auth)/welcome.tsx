import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { LanguageChips } from '@/components/LanguageChips';
import { ActionSheet, Button, Icon, Screen, Text } from '@/components/ui';
import { enterLocalMode } from '@/features/auth/appModeSwitch';
import { SocialButtons } from '@/features/auth/SocialButtons';
import { useT } from '@/i18n';
import { radii, spacing, useTheme } from '@/theme';

const NOTICE_KEY = 'localNoticeSeen';

export default function WelcomeScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const router = useRouter();
  const [notice, setNotice] = useState(false);

  // The data-loss notice is shown once; after that the button enters local mode directly.
  const startLocal = async () => {
    const seen = await AsyncStorage.getItem(NOTICE_KEY).catch(() => null);
    if (seen) void enterLocalMode();
    else setNotice(true);
  };
  const confirmLocal = async () => {
    await AsyncStorage.setItem(NOTICE_KEY, '1').catch(() => undefined);
    await enterLocalMode();
  };

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
      <LanguageChips />
      <View style={styles.actions}>
        <Button title={t('auth.signUp')} onPress={() => router.push('/(auth)/sign-up')} />
        <Button title={t('auth.signIn')} variant="tinted" onPress={() => router.push('/(auth)/sign-in')} />
        <SocialButtons />
        <Button title={t('auth.useLocal')} variant="plain" onPress={() => void startLocal()} />
      </View>
      <ActionSheet
        visible={notice}
        onClose={() => setNotice(false)}
        title={t('auth.localNoticeTitle')}
        message={t('auth.localNoticeBody')}
        cancelLabel={t('common.cancel')}
        options={[{ label: t('common.confirm'), onPress: () => void confirmLocal() }]}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: spacing.md, paddingTop: 72, paddingBottom: spacing.xxxl },
  logo: { width: 96, height: 96, borderRadius: radii.xl, alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' },
  actions: { gap: spacing.sm, paddingHorizontal: spacing.lg },
});
