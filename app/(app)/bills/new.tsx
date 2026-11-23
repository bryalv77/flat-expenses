import { Stack, useLocalSearchParams } from 'expo-router';

import { EmptyState, Screen, ScreenSpinner } from '@/components/ui';
import { BillForm, type BillFormSubmit } from '@/features/bills/components/BillForm';
import { useBill, useCreateBill } from '@/features/bills/hooks';
import { useCategories } from '@/features/categories/hooks';
import { useActiveHouse } from '@/features/houses/hooks';
import { toStorageFiles } from '@/features/bills/pickedFile';
import { useBillSubmit } from '@/features/bills/useBillSubmit';
import { useT } from '@/i18n';
import { addMonthsClamped } from '@/lib/dates';

export default function NewBillScreen() {
  const { t } = useT();
  const { house, isAdmin } = useActiveHouse();
  const categories = useCategories(house?.id);
  const { from } = useLocalSearchParams<{ from?: string }>();
  const source = useBill(house?.id, from);
  const create = useCreateBill(house?.id ?? '');
  const { progress, error, run } = useBillSubmit();

  if (!house || !isAdmin) {
    return (
      <Screen>
        <Stack.Screen options={{ title: t('expenses.newBill') }} />
        <EmptyState icon="lock" title={house ? t('billsUi.adminOnly') : t('billsUi.noHouse')} />
      </Screen>
    );
  }

  if (from && source.isLoading) {
    return <ScreenSpinner />;
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

  const submit = ({ values, newFiles }: BillFormSubmit) =>
    run(newFiles.length > 0, (onProgress, callbacks) =>
      create.mutate({ fields: { ...values, notes: values.notes ?? undefined }, files: toStorageFiles(newFiles), onProgress }, callbacks),
    );

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
