import { StyleSheet, View } from 'react-native';

import { Button, Text, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { spacing } from '@/theme';

import { useAppleSignIn, useGoogleSignIn } from './social';

/** Google / Apple buttons, rendered only for providers enabled by feature flags and platform. */
export function SocialButtons() {
  const { t } = useT();
  const toast = useToast();
  const google = useGoogleSignIn();
  const apple = useAppleSignIn();

  if (!google.enabled && !apple.enabled) return null;

  const run = (signIn: () => Promise<void>) => () => {
    signIn().catch(() => toast.error(t('account.socialFailed')));
  };

  return (
    <View style={styles.wrap}>
      <Text variant="footnote" color="secondaryLabel" style={styles.or}>
        {t('auth.or')}
      </Text>
      {apple.enabled ? <Button title={t('auth.apple')} icon="lock" variant="tinted" onPress={run(apple.signIn)} /> : null}
      {google.enabled ? <Button title={t('auth.google')} icon="key" variant="tinted" onPress={run(google.signIn)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm, marginTop: spacing.lg },
  or: { textAlign: 'center' },
});
