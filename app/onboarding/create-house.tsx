import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Stack, useRouter, type Href } from 'expo-router';
import { useMemo } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';
import { z } from 'zod';

import { HeaderControls } from '@/components/HeaderControls';
import { Button, ListRow, MoneyInput, Screen, SegmentedControl, Section, Switch, Text, TextField, useToast } from '@/components/ui';
import { leaveLocalMode } from '@/features/auth/appModeSwitch';
import { houseSchema, parseDayInput } from '@/features/houses/houseFields';
import { useCreateHouse } from '@/features/houses/hooks';
import { seedSuggestedCategories } from '@/features/houses/seed';
import { markPendingSync } from '@/features/sync/pending';
import { useT } from '@/i18n';
import { getAppMode } from '@/lib/appMode';
import { haptics } from '@/lib/haptics';
import { spacing } from '@/theme';
import type { SplitMode } from '@/types/domain';

export default function CreateHouseScreen() {
  const { t } = useT();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const createHouse = useCreateHouse();

  const schema = useMemo(
    () =>
      houseSchema(t, { seedCategories: z.boolean() }),
    [t],
  );
  type Values = z.infer<typeof schema>;

  const { control, handleSubmit, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      address: '',
      splitMode: 'EQUAL',
      fixedContributionCents: null,
      contributionDayOfMonth: null,
      seedCategories: true,
    },
  });
  const splitMode = useWatch({ control, name: 'splitMode' });

  const onSubmit = handleSubmit(async (v) => {
    try {
      const fixed = v.splitMode === 'FIXED_CONTRIBUTION';
      const houseId = await createHouse.mutateAsync({
        name: v.name,
        address: v.address || null,
        splitMode: v.splitMode,
        fixedContributionCents: fixed ? v.fixedContributionCents : null,
        contributionDayOfMonth: fixed ? v.contributionDayOfMonth : null,
      });
      if (v.seedCategories) await seedSuggestedCategories(qc, houseId, t);
      haptics.success();
      router.replace('/(app)/(tabs)' as Href);
    } catch (e) {
      toast.fail(e);
    }
  });

  const splitOptions: { value: SplitMode; label: string }[] = [
    { value: 'EQUAL', label: t('onboarding.equal') },
    { value: 'FIXED_CONTRIBUTION', label: t('onboarding.fixed') },
  ];

  return (
    <Screen>
      <Stack.Screen options={{ headerRight: () => <HeaderControls /> }} />
      <View style={styles.form}>
        <Text variant="largeTitle">{t('onboarding.createHouse')}</Text>
        <Controller
          control={control}
          name="name"
          render={({ field, fieldState }) => (
            <TextField
              label={t('onboarding.houseName')}
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="address"
          render={({ field, fieldState }) => (
            <TextField
              label={`${t('onboarding.address')} (${t('common.optional')})`}
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              autoComplete="street-address"
            />
          )}
        />
        <Text variant="footnote" color="secondaryLabel">
          {t('onboarding.splitMode')}
        </Text>
        <Controller
          control={control}
          name="splitMode"
          render={({ field }) => <SegmentedControl options={splitOptions} value={field.value} onChange={field.onChange} />}
        />
        {splitMode === 'FIXED_CONTRIBUTION' ? (
          <>
            <Controller
              control={control}
              name="fixedContributionCents"
              render={({ field, fieldState }) => (
                <MoneyInput
                  label={t('onboarding.fixedAmount')}
                  value={field.value}
                  onChange={field.onChange}
                  error={fieldState.error?.message}
                />
              )}
            />
            <Controller
              control={control}
              name="contributionDayOfMonth"
              render={({ field, fieldState }) => (
                <TextField
                  label={`${t('account.contributionDay')} (${t('common.optional')})`}
                  value={field.value === null ? '' : String(field.value)}
                  onChangeText={(text) => field.onChange(parseDayInput(text))}
                  onBlur={field.onBlur}
                  error={fieldState.error ? t('common.required') : undefined}
                  keyboardType="number-pad"
                  maxLength={2}
                />
              )}
            />
          </>
        ) : null}
        <Controller
          control={control}
          name="seedCategories"
          render={({ field }) => (
            <Section footer={t('account.suggestedHint')}>
              <ListRow
                title={t('onboarding.suggested')}
                trailing={<Switch value={field.value} onValueChange={field.onChange} accessibilityLabel={t('onboarding.suggested')} />}
              />
            </Section>
          )}
        />
        <Button
          title={formState.isSubmitting ? t('account.creating') : t('onboarding.createHouse')}
          onPress={onSubmit}
          loading={formState.isSubmitting}
        />
        {getAppMode() === 'local' ? (
          <Button title={t('localMode.logIn')} variant="plain" onPress={() => void markPendingSync().then(() => leaveLocalMode())} />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.sm, paddingHorizontal: spacing.lg },
});
