import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Badge, Card, ListRow, Section, Text } from '@/components/ui';
import { useT } from '@/i18n';
import { addMonthsToKey } from '@/lib/dates';
import { formatMoney } from '@/lib/format';
import { spacing } from '@/theme';

import { projectMonth, type ProjectionBasis } from '..';
import { MonthStepper } from './shared';
import type { ReportData } from './useReportData';

export function ForecastSection({ data }: { data: ReportData }) {
  const { t, locale } = useT();
  const [month, setMonth] = useState(addMonthsToKey(data.currentMonth, 1));
  const house = data.house;

  const projection = useMemo(
    () =>
      house
        ? projectMonth({
            targetMonth: month,
            categories: data.activeCategories,
            bills: data.bills,
            members: data.members,
            house,
          })
        : null,
    [house, month, data.activeCategories, data.bills, data.members],
  );

  if (!house || !projection) return null;
  const money = (c: number) => formatMoney(c, locale);
  const basisLabel: Record<ProjectionBasis, string> = {
    SCHEDULE: t('reportsUi.basisSchedule'),
    LAST_YEAR: t('reportsUi.basisLastYear'),
    TRAILING_AVERAGE: t('reportsUi.basisAverage'),
    NONE: t('reportsUi.basisNone'),
  };
  const confidenceText =
    projection.confidence === 'LOW' ? t('reports.lowData') : t('reports.basedOn', { n: projection.monthsOfData });
  const isFixed = house.splitMode === 'FIXED_CONTRIBUTION';
  const nameOf = (id: string) => data.categories.find((c) => c.id === id)?.name ?? '—';
  const memberName = (id: string) => data.members.find((m) => m.id === id)?.displayName ?? '—';
  const balance = projection.balance;

  return (
    <View style={styles.wrap}>
      <MonthStepper month={month} onChange={setMonth} min={addMonthsToKey(data.currentMonth, 0)} max={addMonthsToKey(data.currentMonth, 24)} />

      <Card>
        <Text variant="footnote" color="secondaryLabel">
          {t('reportsUi.expectedTotal')}
        </Text>
        <Text variant="largeTitle">{money(projection.totalCents)}</Text>
        <Text variant="subhead" color="secondaryLabel">
          {`${t('reports.range')}: ${money(projection.lowCents)} – ${money(projection.highCents)}`}
        </Text>
        <Badge label={confidenceText} tone={projection.confidence === 'LOW' ? 'orange' : 'green'} />
      </Card>

      <Section header={t('reportsUi.perCategory')}>
        {projection.perCategory.length === 0 ? (
          <ListRow title={t('reportsUi.noData')} />
        ) : (
          projection.perCategory.map((p) => (
            <ListRow
              key={p.categoryId}
              title={nameOf(p.categoryId)}
              subtitle={`${basisLabel[p.basis]} · ${money(p.lowCents)} – ${money(p.highCents)}`}
              value={money(p.estimateCents)}
            />
          ))
        )}
      </Section>

      {isFixed ? (
        <Section header={t('reportsUi.projectedBalance')}>
          <ListRow title={t('reportsUi.expectedIncome')} value={money(balance.expectedIncomeCents)} />
          <ListRow title={t('reportsUi.spent')} value={money(projection.totalCents)} />
          <ListRow
            title={balance.balanceCents >= 0 ? t('reportsUi.surplus') : t('reportsUi.short')}
            value={money(Math.abs(balance.balanceCents))}
            trailing={<Badge label={balance.balanceCents >= 0 ? t('reportsUi.surplus') : t('reportsUi.short')} tone={balance.balanceCents >= 0 ? 'green' : 'red'} />}
          />
        </Section>
      ) : (
        <Section header={t('reportsUi.perPersonShare')}>
          {projection.perPerson.length === 0 ? (
            <ListRow title={t('reportsUi.noPeople')} />
          ) : (
            projection.perPerson.map((p) => <ListRow key={p.memberId} title={memberName(p.memberId)} value={money(p.cents)} />)
          )}
        </Section>
      )}
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { gap: spacing.lg } });
