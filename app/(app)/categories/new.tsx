import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Screen, useToast } from '@/components/ui';
import { CategoryForm } from '@/features/categories/CategoryForm';
import { useCreateCategory } from '@/features/categories/hooks';
import { AdminOnlyScreen } from '@/features/houses/AdminOnlyScreen';
import { useActiveHouse } from '@/features/houses/hooks';
import { useT } from '@/i18n';

export default function NewCategoryScreen() {
  const { t } = useT();
  const router = useRouter();
  const toast = useToast();
  const { house, isAdmin } = useActiveHouse();
  const create = useCreateCategory(house?.id ?? '');

  if (!house || !isAdmin) return <AdminOnlyScreen />;

  return (
    <Screen>
      <View>
        <CategoryForm
          submitLabel={t('common.save')}
          onSubmit={async (input) => {
            try {
              await create.mutateAsync(input);
              router.back();
            } catch (e) {
              toast.fail(e);
            }
          }}
        />
      </View>
    </Screen>
  );
}
