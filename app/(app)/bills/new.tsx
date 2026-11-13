import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { EmptyState, Screen, useToast } from '@/components/ui';
import { BillForm, type BillFormSubmit } from '@/features/bills/components/BillForm';
import { useBill, useCreateBill } from '@/features/bills/hooks';
import { useCategories } from '@/features/categories/hooks';
import { useActiveHouse } from '@/features/houses/hooks';
import { toStorageFiles } from '@/features/bills/pickedFile';
import { useT } from '@/i18n';
import { addMonthsClamped } from '@/lib/dates';
import { haptics } from '@/lib/haptics';

export default function NewBillScreen() {
  const { t } = useT();
  const router = useRouter();
  const toast = useToast();
  const { house, isAdmin } = useActiveHouse();
  const categories = useCategories(house?.id);
  const { from } = useLocalSearchParams<{ from?: string }>();
  const source = useBill(house?.id, from);
  const create = useCreateBill(house?.id ?? '');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!house || !isAdmin) {
    return (
      <Screen>
        <Stack.Screen options={{ title: t('expenses.newBill') }} />
        <EmptyState icon="lock" title={house ? t('billsUi.adminOnly') : t('billsUi.noHouse')} />
      </Screen>
    );
  }

  if (from && source.isLoading) {
    return (
      <Screen>
        <ActivityIndicator />
      </Screen>
    );
  }
  // Duplicate: same data one month later; the attachment is not copied.
  const shift = (iso: string | null) => (iso ? addMonthsClamped(iso, 1) : null);
  const initial = source.data && {
    ...source.data,
    chargeDate: shift(source.data.chargeDate),
    periodStartDate: shift(source.data.periodStartDate),
    periodEndDate: shift(source.data.periodEndDate),
    files: [],
  };

  const submit = ({ values, newFiles }: BillFormSubmit) => {
    setError(null);
    setProgress(newFiles.length ? 0 : null);
    create.mutate(
      {
        fields: { ...values, notes: values.notes ?? undefined },
        files: toStorageFiles(newFiles),
        onProgress: setProgress,
      },
      {
        onSuccess: () => {
          haptics.success();
          toast.success(t('billsUi.saved'));
          router.back();
        },
        onError: () => {
          haptics.error();
          setError(newFiles.length ? t('billsUi.uploadFailed') : t('errors.generic'));
          setProgress(null);
        },
      },
    );
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: t('expenses.newBill') }} />
      <BillForm
        initial={initial ?? undefined}
        categories={categories.data ?? []}
        submitLabel={t('common.save')}
        submitting={create.isPending}
        progress={progress}
        errorMessage={error}
        onSubmit={submit}
      />
    </Screen>
  );
}
