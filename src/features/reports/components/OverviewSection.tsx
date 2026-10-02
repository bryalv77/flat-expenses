import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { StackedBarChart } from '@/components/charts';
import { Card, EmptyState, isIconName, ListRow, Section, Text, type IconName } from '@/components/ui';
import { getEffectiveDate } from '@/features/finance';
import { useT } from '@/i18n';
import { formatDate, formatMoney, formatMonth } from '@/lib/format';
import { spacing } from '@/theme';

import { lastNMonths, lookupMonth, monthlySeries } from '..';
import type { ReportData } from './useReportData';

/** Last 12 months stacked by category; tapping a bar drills into that month's bills. */
export function OverviewSection({ data }: { data: ReportData }) {
  const { t, locale } = useT();
  const router = useRouter();
  const [selected, setSelected] = useState<string>(data.currentMonth);

  const months = useMemo(() => lastNMonths(data.currentMonth, 12), [data.currentMonth]);
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

  if (data.bills.length === 0) return <EmptyState icon="chart" title={t('reportsUi.noData')} />;

  return (
    <View style={styles.wrap}>
      <Card>
        <Text variant="headline">{t('reportsUi.last12')}</Text>
        <StackedBarChart
          data={chartData}
          selectedKey={selected}
          onSelect={setSelected}
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

const styles = StyleSheet.create({ wrap: { gap: spacing.lg } });
