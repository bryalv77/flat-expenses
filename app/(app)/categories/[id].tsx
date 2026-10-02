import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';

import { EmptyState, Screen, Text, useToast } from '@/components/ui';
import { CategoryForm } from '@/features/categories/CategoryForm';
import { useCategories, useUpdateCategory } from '@/features/categories/hooks';
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
      </View>
    </Screen>
  );
}
