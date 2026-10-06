import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Chip, Icon, isIconName, Text } from '@/components/ui';
import { useT } from '@/i18n';
import { addMonthsToKey, monthEnd, monthStart } from '@/lib/dates';
import { formatMonth } from '@/lib/format';
import { MIN_TOUCH, spacing, useTheme } from '@/theme';
import type { ExpenseCategory } from '@/types/domain';

/** ‹ March 2026 › stepper, bounded by optional min/max month keys. */
export function MonthStepper({
  month,
  onChange,
  min,
  max,
}: {
  month: string;
  onChange: (month: string) => void;
  min?: string;
  max?: string;
}) {
  const { locale } = useT();
  const { colors } = useTheme();
  const canPrev = !min || month > min;
  const canNext = !max || month < max;
  return (
    <View style={styles.stepper}>
      <Pressable
        onPress={() => canPrev && onChange(addMonthsToKey(month, -1))}
        disabled={!canPrev}
        accessibilityRole="button"
        accessibilityLabel="‹"
        style={[styles.arrow, { opacity: canPrev ? 1 : 0.3 }]}
      >
        <View style={styles.flip}>
          <Icon name="chevronRight" size={20} color={colors.tint} />
        </View>
      </Pressable>
      <Text variant="headline" style={styles.monthLabel}>
        {formatMonth(month, locale, 'long')}
      </Text>
      <Pressable
        onPress={() => canNext && onChange(addMonthsToKey(month, 1))}
        disabled={!canNext}
        accessibilityRole="button"
        accessibilityLabel="›"
        style={[styles.arrow, { opacity: canNext ? 1 : 0.3 }]}
      >
        <Icon name="chevronRight" size={20} color={colors.tint} />
      </Pressable>
    </View>
  );
}

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
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
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

export function SectionTitle({ children }: { children: string }) {
  return (
    <Text variant="footnote" color="secondaryLabel" style={styles.title} accessibilityRole="header">
      {children.toUpperCase()}
    </Text>
  );
}

const styles = StyleSheet.create({
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  arrow: { minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
  flip: { transform: [{ rotate: '180deg' }] },
  monthLabel: { textAlign: 'center', flex: 1, textTransform: 'capitalize' },
  chips: { gap: spacing.sm, paddingVertical: spacing.xs },
  title: { marginTop: spacing.sm },
});

export type RangeKey = '3' | '6' | '12' | 'all';

/** Time-range filter chips (3 / 6 / 12 months / all time). */
export function RangeChips({ value, onChange }: { value: RangeKey; onChange: (r: RangeKey) => void }) {
  const { t } = useT();
  const options: [RangeKey, string][] = [
    ['3', t('reportsUi.last3')],
    ['6', t('reportsUi.last6')],
    ['12', t('reportsUi.last12')],
    ['all', t('reportsUi.allTime')],
  ];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.chips}>
      {options.map(([key, label]) => (
        <Chip key={key} label={label} selected={value === key} onPress={() => onChange(key)} />
      ))}
    </ScrollView>
  );
}

/** Keeps only items whose effective date falls in the last N months (current month included). */
export function filterByRange<T>(items: T[], dateOf: (item: T) => string, range: RangeKey, currentMonth: string): T[] {
  if (range === 'all') return items;
  const from = monthStart(addMonthsToKey(currentMonth, -(Number(range) - 1)));
  const to = monthEnd(currentMonth);
  return items.filter((i) => {
    const d = dateOf(i);
    return d >= from && d <= to;
  });
}
