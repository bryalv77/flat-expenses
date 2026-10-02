import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';

import { EmptyState, Screen, useToast } from '@/components/ui';
import { BillForm, type BillFormSubmit } from '@/features/bills/components/BillForm';
import { useCreateBill } from '@/features/bills/hooks';
import { useCategories } from '@/features/categories/hooks';
import { useActiveHouse } from '@/features/houses/hooks';
import { toStorageFile } from '@/features/bills/pickedFile';
import { useT } from '@/i18n';
import { haptics } from '@/lib/haptics';

export default function NewBillScreen() {
  const { t } = useT();
  const router = useRouter();
  const toast = useToast();
  const { house, isAdmin } = useActiveHouse();
  const categories = useCategories(house?.id);
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

  const submit = ({ values, file }: BillFormSubmit) => {
    setError(null);
    setProgress(file ? 0 : null);
    create.mutate(
      {
        fields: { ...values, notes: values.notes ?? undefined },
        file: toStorageFile(file),
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
          setError(file ? t('billsUi.uploadFailed') : t('errors.generic'));
          setProgress(null);
        },
      },
    );
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: t('expenses.newBill') }} />
      <BillForm
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
