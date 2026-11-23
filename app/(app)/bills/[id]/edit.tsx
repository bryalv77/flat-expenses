import { Stack, useLocalSearchParams } from 'expo-router';

import { EmptyState, Screen, ScreenSpinner } from '@/components/ui';
import { BillForm, type BillFormSubmit } from '@/features/bills/components/BillForm';
import { useBill, useUpdateBill } from '@/features/bills/hooks';
import { useCategories } from '@/features/categories/hooks';
import { useActiveHouse } from '@/features/houses/hooks';
import { toStorageFiles } from '@/features/bills/pickedFile';
import { useBillSubmit } from '@/features/bills/useBillSubmit';
import { useT } from '@/i18n';

export default function EditBillScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useT();
  const { house, isAdmin } = useActiveHouse();
  const bill = useBill(house?.id, id);
  const categories = useCategories(house?.id);
  const update = useUpdateBill(house?.id ?? '');
  const { progress, error, run } = useBillSubmit();

  if (bill.isLoading) {
    return <ScreenSpinner />;
  }
  if (!house || !isAdmin || !bill.data) {
    return (
      <Screen>
        <Stack.Screen options={{ title: t('billsUi.editBill') }} />
        <EmptyState icon="lock" title={!bill.data && isAdmin ? t('billsUi.notFound') : t('billsUi.adminOnly')} />
      </Screen>
    );
  }

  const current = bill.data;
  const submit = ({ values, newFiles, keptFiles, removedFiles }: BillFormSubmit) =>
    run(newFiles.length > 0, (onProgress, callbacks) =>
      update.mutate({ id: current.id, fields: values, keptFiles, newFiles: toStorageFiles(newFiles), removedFiles, onProgress }, callbacks),
    );

  return (
    <Screen>
      <Stack.Screen options={{ title: t('billsUi.editBill') }} />
      <BillForm
        initial={current}
        categories={categories.data ?? []}
        submitLabel={t('common.save')}
        submitting={update.isPending}
        progress={progress}
        errorMessage={error}
        onSubmit={submit}
      />
    </Screen>
  );
}
