import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import {
  ActionSheet,
  Chip,
  EmptyState,
  Icon,
  isIconName,
  ListRow,
  Screen,
  Section,
  Skeleton,
  TextField,
  useToast,
  type IconName,
} from '@/components/ui';
import { useBills, useDeleteBill } from '@/features/bills/hooks';
import { useCategories } from '@/features/categories/hooks';
import { getEffectiveDate, getEffectiveMonth } from '@/features/finance';
import { useActiveHouse } from '@/features/houses/hooks';
import { sumCents } from '@/features/reports';
import { useT } from '@/i18n';
import { addMonthsToKey, monthEnd, monthKey, monthStart, todayISO } from '@/lib/dates';
import { formatDate, formatMoney, formatMonth } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { spacing, useTheme } from '@/theme';
import type { Bill } from '@/types/domain';

/** Lowercase and strip accents so `electrico` finds `Eléctrico`. */
function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

type RangeKey = 'month' | '3' | '12' | 'year' | 'all';

function rangeFor(key: RangeKey, today: string): { from: string; to: string } {
  const current = monthKey(today);
  switch (key) {
    case 'month':
      return { from: monthStart(current), to: monthEnd(current) };
    case '3':
      return { from: monthStart(addMonthsToKey(current, -2)), to: monthEnd(current) };
    case '12':
      return { from: monthStart(addMonthsToKey(current, -11)), to: monthEnd(current) };
    case 'year':
      return { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` };
    case 'all':
      return { from: '0000-01-01', to: '9999-12-31' };
  }
}

export default function ExpensesScreen() {
  const { t, locale } = useT();
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { house, isAdmin, isLoading: houseLoading } = useActiveHouse();
  const [range, setRange] = useState<RangeKey>('3');
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [search, setSearch] = useState('');
  const [toDelete, setToDelete] = useState<Bill | null>(null);

  const today = todayISO();
  const searching = search.trim().length > 0;
  // While searching, look through the whole history instead of the selected range.
  const { from, to } = useMemo(() => rangeFor(searching ? 'all' : range, today), [range, today, searching]);
  const bills = useBills(house?.id, { from, to, categoryId });
  const categories = useCategories(house?.id);
  const remove = useDeleteBill(house?.id ?? '');

  const catById = useMemo(() => new Map((categories.data ?? []).map((c) => [c.id, c])), [categories.data]);

  const groups = useMemo(() => {
    const q = normalizeText(search);
    const amountQuery = q.replace(',', '.');
    const matches = (b: Bill) => {
      const cat = catById.get(b.categoryId);
      const haystack = normalizeText(
        [
          cat?.name,
          b.notes,
          b.fileName,
          formatDate(getEffectiveDate(b), locale, 'long'),
          formatMonth(getEffectiveMonth(b), locale, 'long'),
          getEffectiveDate(b),
          formatMoney(b.amountCents, locale),
          (b.amountCents / 100).toFixed(2),
        ]
          .filter(Boolean)
          .join(' | '),
      );
      return haystack.includes(q) || (/^[\d.]+$/.test(amountQuery) && (b.amountCents / 100).toFixed(2).includes(amountQuery));
    };
    const filtered = (bills.data ?? []).filter((b) => !q || matches(b));
    const byMonth = new Map<string, Bill[]>();
    for (const b of filtered) {
      const key = getEffectiveMonth(b);
      byMonth.set(key, [...(byMonth.get(key) ?? []), b]);
    }
    return [...byMonth.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [bills.data, search, catById, locale]);

  const rangeOptions: { key: RangeKey; label: string }[] = [
    { key: 'month', label: t('billsUi.rangeMonth') },
    { key: '3', label: t('billsUi.range3') },
    { key: '12', label: t('billsUi.range12') },
    { key: 'year', label: t('billsUi.rangeYear') },
    { key: 'all', label: t('common.all') },
  ];

  const addButton = isAdmin ? (
    <Pressable
      onPress={() => router.push('/bills/new')}
      accessibilityRole="button"
      accessibilityLabel={t('expenses.newBill')}
      hitSlop={8}
      style={styles.add}
    >
      <Icon name="plus" size={22} color={colors.tint} />
    </Pressable>
  ) : undefined;

  const confirmDelete = () => {
    if (!toDelete) return;
    remove.mutate(toDelete, {
      onSuccess: () => {
        haptics.success();
        toast.success(t('billsUi.deleted'));
      },
      onError: () => toast.error(t('errors.generic')),
    });
  };

  return (
    <Screen
      title={t('expenses.title')}
      headerRight={addButton}
      refreshing={bills.isRefetching}
      onRefresh={() => void bills.refetch()}
    >
      <View style={styles.filters}>
        <TextField
          value={search}
          onChangeText={setSearch}
          placeholder={t('billsUi.searchPlaceholder')}
          accessibilityLabel={t('common.search')}
          clearButtonMode="while-editing"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chips}>
          {rangeOptions.map((o) => (
            <Chip key={o.key} label={o.label} selected={!searching && range === o.key} onPress={() => { setSearch(''); setRange(o.key); }} />
          ))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chips}>
          <Chip label={t('common.all')} selected={!categoryId} onPress={() => setCategoryId(undefined)} />
          {(categories.data ?? []).map((c) => (
            <Chip
              key={c.id}
              label={c.name}
              color={c.color}
              icon={isIconName(c.icon) ? c.icon : undefined}
              selected={categoryId === c.id}
              onPress={() => setCategoryId(categoryId === c.id ? undefined : c.id)}
            />
          ))}
        </ScrollView>
      </View>

      {houseLoading || bills.isLoading ? (
        <View style={styles.skeletons}>
          <Skeleton height={64} />
          <Skeleton height={64} />
          <Skeleton height={64} />
        </View>
      ) : bills.isError ? (
        <EmptyState icon="warning" title={t('common.error')} actionLabel={t('common.retry')} onAction={() => void bills.refetch()} />
      ) : groups.length === 0 ? (
        <EmptyState
          icon="document"
          title={search ? t('billsUi.noResults') : t('expenses.empty')}
          message={search ? undefined : t('expenses.emptyHint')}
          actionLabel={isAdmin && !search ? t('expenses.newBill') : undefined}
          onAction={isAdmin ? () => router.push('/bills/new') : undefined}
        />
      ) : (
        groups.map(([month, items]) => (
          <Section key={month} header={`${formatMonth(month, locale, 'long')} · ${formatMoney(sumCents(items), locale)}`}>
            {items.map((b) => {
              const cat = catById.get(b.categoryId);
              return (
                <ListRow
                  key={b.id}
                  title={cat?.name ?? '—'}
                  subtitle={[formatDate(getEffectiveDate(b), locale, 'medium'), b.notes].filter(Boolean).join(' · ')}
                  value={formatMoney(b.amountCents, locale)}
                  icon={cat && isIconName(cat.icon) ? (cat.icon as IconName) : 'document'}
                  iconColor={cat?.color}
                  chevron
                  onPress={() => router.push(`/bills/${b.id}`)}
                  swipeActions={isAdmin ? [{ label: t('common.delete'), destructive: true, onPress: () => setToDelete(b) }] : undefined}
                />
              );
            })}
          </Section>
        ))
      )}

      <ActionSheet
        visible={toDelete !== null}
        onClose={() => setToDelete(null)}
        title={t('expenses.deleteConfirm')}
        cancelLabel={t('common.cancel')}
        options={[{ label: t('common.delete'), destructive: true, onPress: confirmDelete }]}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: { gap: spacing.sm, paddingHorizontal: spacing.lg },
  chipsScroll: { flexGrow: 0 },
  chips: { gap: spacing.sm, paddingVertical: spacing.xs, alignItems: 'center' },
  skeletons: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  add: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
