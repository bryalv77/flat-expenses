import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { LineChart } from '@/components/charts';
import { Badge, Card, EmptyState, ListRow, Section, Text } from '@/components/ui';
import { useT } from '@/i18n';
import { formatMoney, formatMonth } from '@/lib/format';
import { spacing } from '@/theme';

import { categoryStats } from '..';
import { CategoryChips } from './shared';
import type { ReportData } from './useReportData';

export function CategorySection({ data }: { data: ReportData }) {
  const { t, locale } = useT();
  const [picked, setPicked] = useState<string | null>(null);
  const categoryId = picked ?? data.activeCategories[0]?.id ?? null;
  const category = data.categories.find((c) => c.id === categoryId);

  const stats = useMemo(() => (category ? categoryStats(data.bills, category) : null), [data.bills, category]);

  if (!category) return <EmptyState icon="tag" title={t('reportsUi.selectCategory')} />;

  const money = (cents: number | null) => (cents === null ? '—' : formatMoney(cents, locale));
  const trendLabel =
    stats?.trend === 'UP' ? t('reportsUi.up') : stats?.trend === 'DOWN' ? t('reportsUi.down') : t('reportsUi.flat');
  const trendTone = stats?.trend === 'UP' ? 'red' : stats?.trend === 'DOWN' ? 'green' : 'neutral';

  return (
    <View style={styles.wrap}>
      <CategoryChips categories={data.activeCategories} value={categoryId} onChange={setPicked} />

      {!stats || stats.billCount === 0 ? (
        <EmptyState icon="chart" title={t('reportsUi.noCategoryData')} />
      ) : (
        <>
          <Card>
            <Text variant="headline">{category.name}</Text>
            <LineChart
              xLabels={stats.amortizedSeries.map((p) => formatMonth(p.month, locale, 'short'))}
              series={[
                { key: 'amortized', label: t('reportsUi.perMonthAverage'), color: category.color, values: stats.amortizedSeries.map((p) => p.cents) },
              ]}
              accessibilityLabel={`${category.name}: ${t('reportsUi.perMonthAverage')}`}
            />
            <Text variant="footnote" color="secondaryLabel">
              {t('reportsUi.bimonthlyNote')}
            </Text>
          </Card>

          <Section>
            <ListRow title={t('reports.total')} value={money(stats.totalCents)} />
            <ListRow title={t('reportsUi.billCount')} value={String(stats.billCount)} />
            <ListRow title={t('reportsUi.perBillAverage')} value={money(stats.avgPerBillCents)} />
            <ListRow title={t('reportsUi.perMonthAverage')} value={money(stats.avgPerMonthCents)} />
            <ListRow title={t('reports.min')} value={money(stats.minBillCents)} />
            <ListRow title={t('reports.max')} value={money(stats.maxBillCents)} />
            <ListRow
              title={t('reportsUi.trend')}
              subtitle={t('reportsUi.trendPerMonth', { amount: formatMoney(Math.round(stats.trendCentsPerMonth), locale) })}
              trailing={<Badge label={trendLabel} tone={trendTone} />}
            />
          </Section>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { gap: spacing.lg } });
