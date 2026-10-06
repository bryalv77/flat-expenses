import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { StackedBarChart } from '@/components/charts';
import { Card, Chip, EmptyState, isIconName, ListRow, Section, Text, type IconName } from '@/components/ui';
import { getEffectiveDate } from '@/features/finance';
import { useT } from '@/i18n';
import { addMonthsToKey } from '@/lib/dates';
import { formatDate, formatMoney, formatMonth } from '@/lib/format';
import { spacing } from '@/theme';

import { lastNMonths, lookupMonth, monthlySeries, totalsByMonth } from '..';
import { Stat } from './Stat';
import { MonthStepper } from './shared';
import type { ReportData } from './useReportData';

/** Last 12 months stacked by category; tapping a bar drills into that month's bills. */
export function OverviewSection({ data }: { data: ReportData }) {
  const { t, locale } = useT();
  const router = useRouter();
  const [selected, setSelected] = useState<string>(data.currentMonth);
  // The chart shows 12 months ending at `windowEnd`; picking a month outside it slides the window.
  const [windowEnd, setWindowEnd] = useState<string>(data.currentMonth);

  const select = (m: string) => {
    setSelected(m);
    if (m > windowEnd) setWindowEnd(m);
    else if (m < addMonthsToKey(windowEnd, -11)) setWindowEnd(addMonthsToKey(m, 11) > data.currentMonth ? data.currentMonth : addMonthsToKey(m, 11));
  };

  const firstMonth = useMemo(
    () => data.bills.reduce((min, b) => { const m = getEffectiveDate(b).slice(0, 7); return m < min ? m : min; }, data.currentMonth),
    [data.bills, data.currentMonth],
  );
  const years = useMemo(() => {
    const out: string[] = [];
    for (let y = Number(firstMonth.slice(0, 4)); y <= Number(data.currentMonth.slice(0, 4)); y++) out.push(String(y));
    return out;
  }, [firstMonth, data.currentMonth]);

  const months = useMemo(() => lastNMonths(windowEnd, 12), [windowEnd]);
  const series = useMemo(() => monthlySeries(data.bills, months[0], months[months.length - 1]), [data.bills, months]);
  const catById = useMemo(() => new Map(data.categories.map((c) => [c.id, c])), [data.categories]);
  const drill = useMemo(() => lookupMonth(data.bills, selected), [data.bills, selected]);

  const chartData = series.map((row) => ({
    key: row.month,
    label: formatMonth(row.month, locale, 'short'),
    segments: Object.entries(row.byCategory).map(([categoryId, value]) => ({
      key: categoryId,
      value,
      color: catById.get(categoryId)?.color ?? '#8E8E93',
    })),
  }));

  const totals = useMemo(() => totalsByMonth(data.bills), [data.bills]);
  const monthsWithBills = Object.values(totals).filter((c) => c > 0);
  const allTotal = monthsWithBills.reduce((a, b) => a + b, 0);
  const avgAll = monthsWithBills.length ? Math.round(allTotal / monthsWithBills.length) : 0;
  const last12 = months.map((m) => totals[m] ?? 0).filter((c) => c > 0);
  const avg12 = last12.length ? Math.round(last12.reduce((a, b) => a + b, 0) / last12.length) : 0;

  if (data.bills.length === 0) return <EmptyState icon="chart" title={t('reportsUi.noData')} />;

  return (
    <View style={styles.wrap}>
      <View style={styles.stats}>
        <Stat inRow label={t('reportsUi.avgMonthly')} value={formatMoney(avgAll, locale)} hint={`${t('reportsUi.allTime')} · ${monthsWithBills.length}`} />
        <Stat inRow label={t('reportsUi.avgLast12')} value={formatMoney(avg12, locale)} />
      </View>
      <Stat label={t('reportsUi.totalSpent')} value={formatMoney(allTotal, locale)} hint={t('reportsUi.allTime')} />
      <MonthStepper month={selected} onChange={select} min={firstMonth} max={data.currentMonth} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.yearsScroll} contentContainerStyle={styles.years}>
        {years.map((y) => (
          <Chip
            key={y}
            label={y}
            selected={selected.slice(0, 4) === y}
            onPress={() => select(y === data.currentMonth.slice(0, 4) ? data.currentMonth : `${y}-12` < firstMonth ? firstMonth : `${y}-12`)}
          />
        ))}
      </ScrollView>

      <Card>
        <Text variant="headline">{`${formatMonth(months[0], locale, 'short')} ${months[0].slice(0, 4)} – ${formatMonth(months[11], locale, 'short')} ${months[11].slice(0, 4)}`}</Text>
        <StackedBarChart
          data={chartData}
          selectedKey={selected}
          onSelect={select}
          accessibilityLabel={t('reports.overview')}
        />
      </Card>

      <Section header={`${formatMonth(selected, locale, 'long')} · ${formatMoney(drill.totalCents, locale)}`}>
        {drill.bills.length === 0 ? (
          <ListRow title={t('reportsUi.noBills')} />
        ) : (
          drill.bills.map((b) => {
            const cat = catById.get(b.categoryId);
            return (
              <ListRow
                key={b.id}
                title={cat?.name ?? '—'}
                subtitle={formatDate(getEffectiveDate(b), locale, 'medium')}
                value={formatMoney(b.amountCents, locale)}
                icon={cat && isIconName(cat.icon) ? (cat.icon as IconName) : 'document'}
                iconColor={cat?.color}
                chevron
                onPress={() => router.push(`/bills/${b.id}`)}
              />
            );
          })
        )}
      </Section>
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { gap: spacing.lg }, stats: { flexDirection: 'row', gap: spacing.md }, yearsScroll: { flexGrow: 0 }, years: { gap: spacing.sm, alignItems: 'center' } });
