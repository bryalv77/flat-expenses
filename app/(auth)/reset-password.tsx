import { zodResolver } from '@hookform/resolvers/zod';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';
import { z } from 'zod';

import { Button, Screen, Text, TextField, useToast } from '@/components/ui';
import { useAuth } from '@/features/auth';
import { authErrorKey } from '@/features/auth/errors';
import { useT } from '@/i18n';
import { spacing } from '@/theme';

/**
 * Opened from the password-reset email (web: /reset-password?token=…; native: costospiso://reset-password?token=…).
 * The Worker already checked the token and sends `?error=INVALID_TOKEN` instead when it is expired or used.
 */
export default function ResetPasswordScreen() {
  const { t } = useT();
  const toast = useToast();
  const router = useRouter();
  const { confirmPasswordReset } = useAuth();
  const { token, error } = useLocalSearchParams<{ token?: string; error?: string }>();

  const schema = useMemo(() => z.object({ password: z.string().min(6, t('auth.shortPassword')) }), [t]);
  type Values = z.infer<typeof schema>;
  const { control, handleSubmit, formState } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { password: '' } });

  const onSubmit = handleSubmit(async ({ password }) => {
    try {
      await confirmPasswordReset?.(token as string, password);
      toast.success(t('account.resetDone'));
      router.replace('/sign-in');
    } catch (e) {
      toast.error(t(authErrorKey(e)));
    }
  });

  // No token, an error from the Worker, or local mode (no password reset): nothing to do here.
  if (!token || error || !confirmPasswordReset) {
    return (
      <Screen>
        <View style={styles.form}>
          <Text variant="largeTitle">{t('account.resetTitle')}</Text>
          <Text variant="body" color="secondaryLabel">{t('account.resetLinkInvalid')}</Text>
          <Button title={t('auth.reset')} onPress={() => router.replace('/forgot-password')} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.form}>
        <Text variant="largeTitle">{t('account.resetTitle')}</Text>
        <Text variant="body" color="secondaryLabel">{t('account.resetHint')}</Text>
        <Controller
          control={control}
          name="password"
          render={({ field, fieldState }) => (
            <TextField
              label={t('account.newPassword')}
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              onSubmitEditing={onSubmit}
            />
          )}
        />
        <Button title={t('common.save')} onPress={onSubmit} loading={formState.isSubmitting} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.sm },
});
