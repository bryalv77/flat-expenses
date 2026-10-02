import { zodResolver } from '@hookform/resolvers/zod';
import { Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';
import { z } from 'zod';

import { Avatar, Button, FilePickerField, Screen, Section, Text, TextField, useToast, type PickedFile } from '@/components/ui';
import { useAuth } from '@/features/auth';
import { reauthErrorKey } from '@/features/auth/errors';
import { useMe, useUpdateProfile, useUploadAvatar } from '@/features/profile/hooks';
import { useT } from '@/i18n';
import { haptics } from '@/lib/haptics';
import { FileValidationError } from '@/lib/storage';
import { useFileUrl } from '@/lib/useFileUrl';
import { spacing } from '@/theme';

function uploadErrorKey(e: unknown) {
  if (e instanceof FileValidationError) return e.code === 'too-large' ? 'errors.fileTooLarge' : 'errors.fileType';
  return 'errors.generic';
}

function AvatarEditor() {
  const { t } = useT();
  const toast = useToast();
  const { data: me } = useMe();
  const { data: url } = useFileUrl(me?.photoPath);
  const upload = useUploadAvatar();
  const [picked, setPicked] = useState<PickedFile | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  const onPick = (file: PickedFile | null) => {
    setPicked(file);
    if (!file) return;
    setProgress(0);
    upload.mutate(
      { file, previousPath: me?.photoPath, onProgress: setProgress },
      {
        onSuccess: () => {
          haptics.success();
          toast.success(t('account.photoUpdated'));
        },
        onError: (e) => {
          haptics.error();
          toast.error(t(uploadErrorKey(e)));
        },
        onSettled: () => {
          setProgress(null);
          setPicked(null);
        },
      },
    );
  };

  return (
    <View style={styles.avatarBlock}>
      <Avatar name={me?.displayName} uri={picked?.uri ?? url ?? undefined} size={96} />
      <FilePickerField
        label={progress !== null ? `${t('expenses.uploading')} ${Math.round(progress * 100)}%` : t('profile.changePhoto')}
        value={picked}
        onChange={onPick}
        imageOnly
      />
    </View>
  );
}

function PasswordSection() {
  const { t } = useT();
  const toast = useToast();
  const { changePassword } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);

  const schema = useMemo(
    () =>
      z.object({
        current: z.string().min(1, t('common.required')),
        next: z.string().min(6, t('auth.shortPassword')),
      }),
    [t],
  );
  type Values = z.infer<typeof schema>;
  const { control, handleSubmit, reset, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { current: '', next: '' },
  });

  const onSubmit = handleSubmit(async ({ current, next }) => {
    setFormError(null);
    try {
      await changePassword(current, next);
      haptics.success();
      toast.success(t('account.passwordChanged'));
      reset();
    } catch (e) {
      haptics.error();
      setFormError(t(reauthErrorKey(e)));
    }
  });

  return (
    <View style={styles.block}>
      <Text variant="headline">{t('profile.changePassword')}</Text>
      <Controller
        control={control}
        name="current"
        render={({ field, fieldState }) => (
          <TextField
            label={t('account.currentPassword')}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
            secureTextEntry
            autoComplete="current-password"
          />
        )}
      />
      <Controller
        control={control}
        name="next"
        render={({ field, fieldState }) => (
          <TextField
            label={t('account.newPassword')}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
            secureTextEntry
            autoComplete="new-password"
          />
        )}
      />
      {formError ? (
        <Text variant="footnote" color="red">
          {formError}
        </Text>
      ) : null}
      <Button title={t('profile.changePassword')} variant="tinted" onPress={onSubmit} loading={formState.isSubmitting} />
    </View>
  );
}

export default function EditProfileScreen() {
  const { t } = useT();
  const toast = useToast();
  const { isPasswordAccount, firebaseUser } = useAuth();
  const { data: me } = useMe();
  const update = useUpdateProfile();

  const schema = useMemo(() => z.object({ displayName: z.string().trim().min(1, t('auth.nameRequired')).max(80) }), [t]);
  type Values = z.infer<typeof schema>;
  const { control, handleSubmit, reset, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { displayName: me?.displayName ?? '' },
  });

  useEffect(() => {
    if (me) reset({ displayName: me.displayName });
  }, [me, reset]);

  const onSubmit = handleSubmit(async ({ displayName }) => {
    try {
      await update.mutateAsync({ displayName });
      haptics.success();
      toast.success(t('account.profileSaved'));
    } catch {
      haptics.error();
      toast.error(t('errors.generic'));
    }
  });

  return (
    <Screen>
      <Stack.Screen options={{ title: t('profile.edit') }} />
      <View style={styles.block}>
        <AvatarEditor />
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
              onSubmitEditing={onSubmit}
            />
          )}
        />
        <TextField label={t('auth.email')} value={me?.email ?? firebaseUser?.email ?? ''} editable={false} hint={t('account.emailReadonly')} />
        <Button title={t('common.save')} onPress={onSubmit} loading={formState.isSubmitting} disabled={!formState.isDirty} />
      </View>
      {isPasswordAccount ? (
        <Section>
          <PasswordSection />
        </Section>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  avatarBlock: { alignItems: 'center', gap: spacing.md, paddingBottom: spacing.md },
});
