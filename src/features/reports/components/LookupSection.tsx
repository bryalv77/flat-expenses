import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card, ListRow, Section, Text } from '@/components/ui';
import { getEffectiveDate } from '@/features/finance';
import { useT } from '@/i18n';
import { formatDate, formatMoney, formatMonth } from '@/lib/format';
import { spacing } from '@/theme';

import { lookupMonth } from '..';
import { CategoryChips, MonthStepper } from './shared';
import type { ReportData } from './useReportData';

/** "How much did we spend on phone in March 2026?" */
export function LookupSection({ data }: { data: ReportData }) {
  const { t, locale } = useT();
  const router = useRouter();
  const [month, setMonth] = useState(data.currentMonth);
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const result = useMemo(() => lookupMonth(data.bills, month, categoryId), [data.bills, month, categoryId]);
  const name = data.categories.find((c) => c.id === categoryId)?.name ?? t('reportsUi.allCategories');

  return (
    <View style={styles.wrap}>
      <CategoryChips categories={data.categories} value={categoryId} onChange={setCategoryId} allowAll />
      <MonthStepper month={month} onChange={setMonth} max={data.currentMonth} />

      <Card>
        <Text variant="footnote" color="secondaryLabel">
          {`${name} · ${formatMonth(month, locale, 'long')}`}
        </Text>
        <Text variant="largeTitle" accessibilityLiveRegion="polite">
          {formatMoney(result.totalCents, locale)}
        </Text>
        <Text variant="subhead" color="secondaryLabel">
          {`${result.billCount} ${t('reports.bills')}`}
        </Text>
      </Card>

      {result.bills.length > 0 ? (
        <Section header={t('reportsUi.billsInMonth')}>
          {result.bills.map((b) => (
            <ListRow
              key={b.id}
              title={data.categories.find((c) => c.id === b.categoryId)?.name ?? '—'}
              subtitle={formatDate(getEffectiveDate(b), locale, 'medium')}
              value={formatMoney(b.amountCents, locale)}
              chevron
              onPress={() => router.push(`/bills/${b.id}`)}
            />
          ))}
        </Section>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { gap: spacing.lg } });
