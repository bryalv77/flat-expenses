import { ScrollView, StyleSheet } from 'react-native';

import { Chip, isIconName } from '@/components/ui';
import { useT } from '@/i18n';
import { spacing } from '@/theme';
import type { ExpenseCategory } from '@/types/domain';

/** Horizontal category chips; `allowAll` adds an "all categories" chip (value null). */
export function CategoryChips({
  categories,
  value,
  onChange,
  allowAll,
}: {
  categories: ExpenseCategory[];
  value: string | null;
  onChange: (id: string | null) => void;
  allowAll?: boolean;
}) {
  const { t } = useT();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll} contentContainerStyle={styles.chips}>
      {allowAll ? <Chip label={t('common.all')} selected={value === null} onPress={() => onChange(null)} /> : null}
      {categories.map((c) => (
        <Chip
          key={c.id}
          label={c.name}
          color={c.color}
          icon={isIconName(c.icon) ? c.icon : undefined}
          selected={value === c.id}
          onPress={() => onChange(c.id)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0 },
  chips: { gap: spacing.sm, paddingVertical: spacing.xs, alignItems: 'center' },
});
