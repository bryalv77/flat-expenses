import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';
import { z } from 'zod';

import { Button, Screen, Text, TextField } from '@/components/ui';
import { useAuth } from '@/features/auth';
import { authErrorKey } from '@/features/auth/errors';
import { SocialButtons } from '@/features/auth/SocialButtons';
import { useT } from '@/i18n';
import { haptics } from '@/lib/haptics';
import { spacing } from '@/theme';

export default function SignInScreen() {
  const { t } = useT();
  const router = useRouter();
  const { signIn } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);

  const schema = useMemo(
    () =>
      z.object({
        email: z.string().trim().email(t('auth.invalidEmail')),
        password: z.string().min(6, t('auth.shortPassword')),
      }),
    [t],
  );
  type Values = z.infer<typeof schema>;

  const { control, handleSubmit, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setFormError(null);
    try {
      await signIn(email, password);
    } catch (e) {
      haptics.error();
      setFormError(t(authErrorKey(e)));
    }
  });

  return (
    <Screen>
      <View style={styles.form}>
        <Text variant="largeTitle">{t('auth.signIn')}</Text>
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
            />
          )}
        />
        <Controller
          control={control}
          name="password"
          render={({ field, fieldState }) => (
            <TextField
              label={t('auth.password')}
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              onSubmitEditing={onSubmit}
            />
          )}
        />
        {formError ? (
          <Text variant="footnote" color="red">
            {formError}
          </Text>
        ) : null}
        <Button title={t('auth.signIn')} onPress={onSubmit} loading={formState.isSubmitting} />
        <Button title={t('auth.forgot')} variant="plain" onPress={() => router.push('/(auth)/forgot-password')} />
        <SocialButtons />
        <Button title={`${t('auth.noAccount')} ${t('auth.signUp')}`} variant="plain" onPress={() => router.replace('/(auth)/sign-up')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.sm, paddingHorizontal: spacing.lg },
});
