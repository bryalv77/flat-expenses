import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { LineChart } from '@/components/charts';
import { Badge, Card, Chip, EmptyState, ListRow, Section, Text } from '@/components/ui';
import { useT } from '@/i18n';
import { formatMoney, formatMonth } from '@/lib/format';
import { spacing } from '@/theme';

import { lastNMonths, whoPays } from '..';
import { Stat } from './Stat';
import type { ReportData } from './useReportData';

type Range = '1' | '3' | '6' | '12' | 'all';

/** Admin (you) vs roommates, month by month: the admin covers what the roommates' payments don't. */
export function WhoPaysSection({ data }: { data: ReportData }) {
  const { t, locale } = useT();
  const [range, setRange] = useState<Range>('12');
  const money = (c: number) => formatMoney(c, locale);

  const firstMonth = useMemo(() => {
    const dates = [...data.bills.map((b) => (b.chargeDate ?? b.periodEndDate ?? b.createdAt).slice(0, 7)), ...data.payments.map((p) => p.month.slice(0, 7))];
    return dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : data.currentMonth;
  }, [data.bills, data.payments, data.currentMonth]);
  const from = range === 'all' ? firstMonth : lastNMonths(data.currentMonth, Number(range))[0];
  const r = useMemo(() => whoPays(data.bills, data.payments, from, data.currentMonth), [data.bills, data.payments, from, data.currentMonth]);

  if (!data.isAdmin) return null;
  if (r.totalCents === 0) return <EmptyState icon="chart" title={t('reportsUi.noData')} />;
  const youPct = r.totalCents > 0 ? Math.round((r.adminCents / r.totalCents) * 100) : 0;

  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rangeScroll} contentContainerStyle={styles.range}>
        {([['1', t('reportsUi.thisMonth')], ['3', t('reportsUi.last3')], ['6', t('reportsUi.last6')], ['12', t('reportsUi.last12')], ['all', t('reportsUi.allTime')]] as [Range, string][]).map(([value, label]) => (
          <Chip key={value} label={label} selected={range === value} onPress={() => setRange(value)} />
        ))}
      </ScrollView>

      <View style={styles.stats}>
        <Stat inRow label={t('reportsUi.totalSpent')} value={money(r.totalCents)} />
        <Stat inRow label={t('reportsUi.avgMonthly')} value={money(r.averageMonthlyCents)} />
      </View>
      <View style={styles.stats}>
        <Stat inRow label={t('reportsUi.youAdmin')} value={money(r.adminCents)} hint={`${youPct}%`} color="#007AFF" />
        <Stat inRow label={t('reportsUi.roommates')} value={money(r.roommatesCents)} hint={`${100 - youPct}%`} color="#34C759" />
      </View>

      <Card>
        <Text variant="headline">{t('reportsUi.whoPays')}</Text>
        {r.rows.length > 1 ? (
        <LineChart
          xLabels={r.rows.map((x) => formatMonth(x.month, locale, 'short'))}
          series={[
            { key: 'admin', label: t('reportsUi.youAdmin'), color: '#007AFF', values: r.rows.map((x) => Math.max(0, x.adminCents)) },
            { key: 'roommates', label: t('reportsUi.roommates'), color: '#34C759', values: r.rows.map((x) => x.roommatesCents) },
          ]}
          accessibilityLabel={t('reportsUi.whoPays')}
        />
        ) : null}
        <Text variant="footnote" color="secondaryLabel">{`${r.monthsAdminMore} ${t('reportsUi.monthsYou')} · ${r.monthsRoommatesMore} ${t('reportsUi.monthsRoomies')}`}</Text>
        <Text variant="footnote" color="secondaryLabel">{t('reportsUi.whoNote')}</Text>
      </Card>

      <Section header={t('reportsUi.whoPays')}>
        {[...r.rows].reverse().filter((x) => x.totalCents > 0 || x.roommatesCents > 0).map((x) => (
          <ListRow
            key={x.month}
            title={formatMonth(x.month, locale, 'long')}
            subtitle={`${t('reportsUi.youAdmin')}: ${money(x.adminCents)} · ${t('reportsUi.roommates')}: ${money(x.roommatesCents)}`}
            value={money(x.totalCents)}
            trailing={<Badge label={x.adminCents >= x.roommatesCents ? t('reportsUi.youPayMore') : t('reportsUi.roommatesPayMore')} tone={x.adminCents >= x.roommatesCents ? 'blue' : 'green'} />}
          />
        ))}
      </Section>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.lg },
  stats: { flexDirection: 'row', gap: spacing.md },
  rangeScroll: { flexGrow: 0 },
  range: { gap: spacing.sm, alignItems: 'center' },
});
