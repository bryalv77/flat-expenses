import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BarChart, LineChart } from '@/components/charts';
import { Card, EmptyState, ListRow, Section, Text } from '@/components/ui';
import { useT } from '@/i18n';
import { formatMoney, formatMonthName, formatPercent } from '@/lib/format';
import { spacing, useTheme } from '@/theme';

import { computeSeasonality } from '..';
import { CategoryChips } from './shared';
import type { ReportData } from './useReportData';

export function SeasonalitySection({ data }: { data: ReportData }) {
  const { t, locale } = useT();
  const { colors } = useTheme();
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const s = useMemo(() => computeSeasonality(data.bills, data.categories, categoryId), [data.bills, data.categories, categoryId]);
  const hasData = s.byMonthOfYear.some((m) => m.samples > 0);
  const accent = data.categories.find((c) => c.id === categoryId)?.color ?? colors.tint;
  const palette = [colors.blue, colors.orange, colors.green, colors.purple, colors.pink];

  const money = (v: number | null) => (v === null ? '—' : formatMoney(Math.round(v), locale));
  const vs = (factor: number | null) => (factor === null ? undefined : formatPercent(factor - 1, locale, 0));

  return (
    <View style={styles.wrap}>
      <CategoryChips categories={data.categories} value={categoryId} onChange={setCategoryId} allowAll />

      {!hasData ? (
        <EmptyState icon="chart" title={t('reportsUi.noData')} />
      ) : (
        <>
          <Card>
            <Text variant="headline">{t('reportsUi.perMonthOfYear')}</Text>
            <BarChart
              data={s.byMonthOfYear.map((m) => ({
                key: String(m.month),
                label: formatMonthName(m.month, locale, 'short'),
                value: Math.round(m.averageCents ?? 0),
                color: accent,
              }))}
              accessibilityLabel={t('reports.seasonality')}
            />
          </Card>

          <Section>
            <ListRow title={t('reports.yearAvg')} value={money(s.yearlyAverageCents)} />
            <ListRow title={t('reports.summer')} subtitle={vs(s.summerFactor) ? `${t('reportsUi.summerVs')}: ${vs(s.summerFactor)}` : undefined} value={money(s.summerAverageCents)} />
            <ListRow title={t('reports.winter')} subtitle={vs(s.winterFactor) ? `${t('reportsUi.winterVs')}: ${vs(s.winterFactor)}` : undefined} value={money(s.winterAverageCents)} />
          </Section>

          {s.yearOverYear.length > 0 ? (
            <Card>
              <Text variant="headline">{t('reportsUi.yoy')}</Text>
              <LineChart
                xLabels={Array.from({ length: 12 }, (_, i) => formatMonthName(i + 1, locale, 'short'))}
                series={s.yearOverYear.map((y, i) => ({
                  key: String(y.year),
                  label: String(y.year),
                  color: palette[i % palette.length],
                  values: y.months,
                }))}
                accessibilityLabel={t('reportsUi.yoy')}
              />
              <View style={styles.legend}>
                {s.yearOverYear.map((y, i) => (
                  <View key={y.year} style={styles.legendItem}>
                    <View style={[styles.dot, { backgroundColor: palette[i % palette.length] }]} />
                    <Text variant="caption" color="secondaryLabel">
                      {y.year}
                    </Text>
                  </View>
                ))}
              </View>
            </Card>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.lg },
  legend: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
