import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, EmptyState, Screen, Text, useToast } from '@/components/ui';
import { CategoryForm } from '@/features/categories/CategoryForm';
import { useArchiveCategory, useCategories, useDeleteCategory, useUpdateCategory } from '@/features/categories/hooks';
import { ConfirmSheet } from '@/features/houses/ConfirmSheet';
import { useActiveHouse } from '@/features/houses/hooks';
import { useT } from '@/i18n';
import { describeSchedule } from '@/features/schedule/occurrences';
import { spacing } from '@/theme';

export default function CategoryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale } = useT();
  const router = useRouter();
  const toast = useToast();
  const { house, isAdmin } = useActiveHouse();
  const { data: categories = [] } = useCategories(house?.id);
  const update = useUpdateCategory(house?.id ?? '');
  const archive = useArchiveCategory(house?.id ?? '');
  const remove = useDeleteCategory(house?.id ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const category = categories.find((c) => c.id === id);

  if (!category) return <Screen><EmptyState icon="folder" title={t('categories.empty')} /></Screen>;

  if (!isAdmin) {
    return (
      <Screen>
        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
          <Text variant="title2">{category.name}</Text>
          <Text color="secondaryLabel">{describeSchedule(category, locale).full}</Text>
          {category.notes ? <Text>{category.notes}</Text> : null}
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ paddingHorizontal: spacing.lg }}>
        <CategoryForm
          initial={category}
          submitLabel={t('common.save')}
          onSubmit={async (input) => {
            try {
              await update.mutateAsync({ ...input, id: category.id });
              router.back();
            } catch {
              toast.error(t('errors.generic'));
            }
          }}
        />
        <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
          <Button
            title={category.isActive ? t('categories.archive') : t('hub.unarchive')}
            variant="tinted"
            onPress={() => archive.mutate({ id: category.id, isActive: !category.isActive }, { onSuccess: () => router.back() })}
          />
          <Button title={t('categories.delete')} variant="tinted" destructive onPress={() => setConfirmDelete(true)} />
        </View>
      </View>
      <ConfirmSheet
        visible={confirmDelete}
        title={t('categories.deleteConfirm')}
        confirmLabel={t('categories.delete')}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          remove.mutate(category.id, {
            onSuccess: () => router.back(),
            onError: (e) => toast.error(e instanceof Error && e.message === 'CATEGORY_HAS_BILLS' ? t('categories.hasBills') : t('errors.generic')),
          });
        }}
      />
    </Screen>
  );
}
