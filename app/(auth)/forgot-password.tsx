import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';
import { z } from 'zod';

import { Button, Screen, Text, TextField, useToast } from '@/components/ui';
import { useAuth } from '@/features/auth';
import { authErrorKey } from '@/features/auth/errors';
import { useT } from '@/i18n';
import { spacing } from '@/theme';

export default function ForgotPasswordScreen() {
  const { t } = useT();
  const toast = useToast();
  const { resetPassword } = useAuth();
  const [sent, setSent] = useState(false);

  const schema = useMemo(() => z.object({ email: z.string().trim().email(t('auth.invalidEmail')) }), [t]);
  type Values = z.infer<typeof schema>;

  const { control, handleSubmit, formState } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: '' } });

  const onSubmit = handleSubmit(async ({ email }) => {
    try {
      await resetPassword(email);
      setSent(true);
    } catch (e) {
      const key = authErrorKey(e);
      // Do not reveal whether the account exists.
      if (key === 'auth.wrongCredentials') setSent(true);
      else toast.error(t(key));
    }
  });

  return (
    <Screen>
      <View style={styles.form}>
        <Text variant="largeTitle">{t('account.forgotTitle')}</Text>
        <Text variant="body" color="secondaryLabel">
          {t('account.forgotHint')}
        </Text>
        <Controller
          control={control}
          name="email"
          render={({ field, fieldState }) => (
            <TextField
              label={t('auth.email')}
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              onSubmitEditing={onSubmit}
            />
          )}
        />
        {sent ? (
          <Text variant="footnote" color="green">
            {t('auth.resetSent')}
          </Text>
        ) : null}
        <Button title={t('auth.reset')} onPress={onSubmit} loading={formState.isSubmitting} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.sm, paddingHorizontal: spacing.lg },
});
