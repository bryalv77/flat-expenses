import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { EmptyState, Screen, useToast } from '@/components/ui';
import { BillForm, type BillFormSubmit } from '@/features/bills/components/BillForm';
import { useBill, useUpdateBill } from '@/features/bills/hooks';
import { useCategories } from '@/features/categories/hooks';
import { useActiveHouse } from '@/features/houses/hooks';
import { toStorageFile } from '@/features/bills/pickedFile';
import { useT } from '@/i18n';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/theme';

export default function EditBillScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useT();
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { house, isAdmin } = useActiveHouse();
  const bill = useBill(house?.id, id);
  const categories = useCategories(house?.id);
  const update = useUpdateBill(house?.id ?? '');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (bill.isLoading) {
    return (
      <Screen>
        <ActivityIndicator color={colors.tint} />
      </Screen>
    );
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
  const submit = ({ values, file, removeFile }: BillFormSubmit) => {
    setError(null);
    setProgress(file ? 0 : null);
    update.mutate(
      {
        id: current.id,
        fields: values,
        newFile: toStorageFile(file),
        removeFile,
        oldFilePath: current.fileStoragePath,
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
