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

export default function SignUpScreen() {
  const { t } = useT();
  const router = useRouter();
  const { signUp } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);

  const schema = useMemo(
    () =>
      z.object({
        displayName: z.string().trim().min(1, t('auth.nameRequired')).max(80),
        email: z.string().trim().email(t('auth.invalidEmail')),
        password: z.string().min(6, t('auth.shortPassword')),
      }),
    [t],
  );
  type Values = z.infer<typeof schema>;

  const { control, handleSubmit, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { displayName: '', email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await signUp(values);
    } catch (e) {
      haptics.error();
      setFormError(t(authErrorKey(e)));
    }
  });

  return (
    <Screen>
      <View style={styles.form}>
        <Text variant="largeTitle">{t('auth.signUp')}</Text>
        <Controller
          control={control}
          name="displayName"
          render={({ field, fieldState }) => (
            <TextField
              label={t('auth.name')}
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              autoComplete="name"
              textContentType="name"
            />
          )}
        />
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
              autoComplete="new-password"
              textContentType="newPassword"
              onSubmitEditing={onSubmit}
            />
          )}
        />
        {formError ? (
          <Text variant="footnote" color="red">
            {formError}
          </Text>
        ) : null}
        <Button title={t('auth.signUp')} onPress={onSubmit} loading={formState.isSubmitting} />
        <SocialButtons />
        <Button title={`${t('auth.haveAccount')} ${t('auth.signIn')}`} variant="plain" onPress={() => router.replace('/(auth)/sign-in')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.sm, paddingHorizontal: spacing.lg },
});
