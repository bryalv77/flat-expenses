import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { LineChart } from '@/components/charts';
import { Badge, Card, EmptyState, ListRow, Section, Text } from '@/components/ui';
import { computeBalanceSeries, computePaymentStatus, recommendContribution } from '@/features/finance';
import { useT } from '@/i18n';
import { formatMoney, formatMonth } from '@/lib/format';
import { spacing } from '@/theme';

import { lastNMonths, perPersonTable, totalsByMonth } from '..';
import type { ReportData } from './useReportData';

/** Mode A: equal split per person per month. Mode B (when the house uses it): contribution balance. Both views are always computed. */
export function PeopleSection({ data }: { data: ReportData }) {
  const { t, locale } = useT();
  const house = data.house;
  const months = useMemo(() => lastNMonths(data.currentMonth, 12), [data.currentMonth]);
  const from = months[0];
  const to = months[months.length - 1];
  const memberName = (id: string) => data.members.find((m) => m.id === id)?.displayName ?? '—';
  const money = (c: number) => formatMoney(c, locale);

  const table = useMemo(() => perPersonTable(data.bills, data.members, from, to), [data.bills, data.members, from, to]);
  const totals = useMemo(() => totalsByMonth(data.bills), [data.bills]);
  const series = useMemo(
    () => (house ? computeBalanceSeries(house, data.members, from, to, totals) : []),
    [house, data.members, from, to, totals],
  );

  if (!house) return null;
  const isFixed = house.splitMode === 'FIXED_CONTRIBUTION';
  const hideBalance = isFixed && !data.isAdmin && !house.showBalanceToRoommates;
  const roommateCount = data.members.filter((m) => m.status === 'ACTIVE' && m.role === 'ROOMMATE').length;
  const recommendation = recommendContribution(
    months.slice(-6).map((m) => totals[m] ?? 0),
    roommateCount,
    RECOMMENDED_MARGIN_CENTS,
  );
  const payments = computePaymentStatus(house, data.members, data.payments, data.currentMonth);
  const last = series[series.length - 1];

  return (
    <View style={styles.wrap}>
      {table.rows.every((r) => r.totalCents === 0) ? (
        <EmptyState icon="people" title={t('reportsUi.noData')} />
      ) : (
        <Section header={t('reportsUi.equalShare')}>
          {[...table.rows].reverse().map((row) => (
            <ListRow
              key={row.month}
              title={formatMonth(row.month, locale, 'long')}
              subtitle={row.shares.map((s) => `${memberName(s.memberId)}: ${money(s.cents)}`).join(' · ') || t('reportsUi.noPeople')}
              value={money(row.totalCents)}
            />
          ))}
          <ListRow title={t('reports.total')} subtitle={Object.entries(table.cumulativeByMember).map(([id, c]) => `${memberName(id)}: ${money(c)}`).join(' · ')} />
        </Section>
      )}

      {isFixed ? (
        hideBalance ? (
          <Text variant="footnote" color="secondaryLabel">
            {t('reportsUi.showBalanceHidden')}
          </Text>
        ) : (
          <>
            <Card>
              <Text variant="headline">{t('reports.balance')}</Text>
              <LineChart
                xLabels={series.map((r) => formatMonth(r.month, locale, 'short'))}
                series={[
                  { key: 'income', label: t('reportsUi.expectedIncome'), color: '#34C759', values: series.map((r) => r.expectedIncomeCents) },
                  { key: 'spent', label: t('reportsUi.spent'), color: '#FF3B30', values: series.map((r) => r.totalSpentCents) },
                ]}
                accessibilityLabel={t('reports.balance')}
              />
              {last ? (
                <View style={styles.row}>
                  <Text variant="subhead" color="secondaryLabel">
                    {t('reportsUi.cumulative')}
                  </Text>
                  <Badge
                    label={money(Math.abs(last.cumulativeBalanceCents))}
                    tone={last.cumulativeBalanceCents >= 0 ? 'green' : 'red'}
                  />
                </View>
              ) : null}
            </Card>

            <Section header={t('reports.balance')}>
              {[...series].reverse().map((r) => (
                <ListRow
                  key={r.month}
                  title={formatMonth(r.month, locale, 'long')}
                  subtitle={`${t('reportsUi.spent')}: ${money(r.totalSpentCents)} · ${t('reportsUi.expectedIncome')}: ${money(r.expectedIncomeCents)}`}
                  value={money(r.balanceCents)}
                  trailing={<Badge label={r.status === 'INSUFFICIENT' ? t('reportsUi.short') : r.status === 'SURPLUS' ? t('reportsUi.surplus') : t('reportsUi.sufficient')} tone={r.status === 'INSUFFICIENT' ? 'red' : r.status === 'SURPLUS' ? 'green' : 'neutral'} />}
                />
              ))}
            </Section>

            {recommendation ? (
              <Section header={t('reportsUi.recommended')}>
                <ListRow title={t('reportsUi.breakEven')} value={money(recommendation.breakEvenCents)} />
                <ListRow
                  title={t('reportsUi.withMargin', { margin: money(RECOMMENDED_MARGIN_CENTS) })}
                  value={money(recommendation.withMarginCents)}
                />
              </Section>
            ) : null}

            <Section header={t('reportsUi.paidPending')}>
              {payments.perMember.map((p) => (
                <ListRow
                  key={p.memberId}
                  title={memberName(p.memberId)}
                  subtitle={`${money(p.paidCents)} / ${money(p.dueCents)}`}
                  trailing={<Badge label={p.state === 'PENDING' || p.state === 'PARTIAL' ? t('home.pending') : t('home.paid')} tone={p.state === 'PENDING' ? 'red' : p.state === 'PARTIAL' ? 'orange' : 'green'} />}
                />
              ))}
            </Section>
          </>
        )
      ) : null}
    </View>
  );
}

/** Monthly buffer suggested on top of break-even. */
const RECOMMENDED_MARGIN_CENTS = 2000;

const styles = StyleSheet.create({
  wrap: { gap: spacing.lg },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
