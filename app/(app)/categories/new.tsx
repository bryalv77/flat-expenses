import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { EmptyState, Screen, useToast } from '@/components/ui';
import { CategoryForm } from '@/features/categories/CategoryForm';
import { useCreateCategory } from '@/features/categories/hooks';
import { useActiveHouse } from '@/features/houses/hooks';
import { useT } from '@/i18n';
import { spacing } from '@/theme';

export default function NewCategoryScreen() {
  const { t } = useT();
  const router = useRouter();
  const toast = useToast();
  const { house, isAdmin } = useActiveHouse();
  const create = useCreateCategory(house?.id ?? '');

  if (!house || !isAdmin) return <Screen><EmptyState icon="lock" title={t('hub.adminOnly')} /></Screen>;

  return (
    <Screen>
      <View style={{ paddingHorizontal: spacing.lg }}>
        <CategoryForm
          submitLabel={t('common.save')}
          onSubmit={async (input) => {
            try {
              await create.mutateAsync(input);
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
