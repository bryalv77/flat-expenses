import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Chip, EmptyState, Icon, Screen, Skeleton, useToast } from '@/components/ui';
import { addMonthsToKey, monthEnd, monthStart } from '@/lib/dates';
import { useT } from '@/i18n';
import { haptics } from '@/lib/haptics';
import { spacing, useTheme } from '@/theme';
import { CategorySection } from '@/features/reports/components/CategorySection';
import { exportBillsCsv } from '@/features/reports/components/exportCsv';
import { ForecastSection } from '@/features/reports/components/ForecastSection';
import { LookupSection } from '@/features/reports/components/LookupSection';
import { OverviewSection } from '@/features/reports/components/OverviewSection';
import { PeopleSection } from '@/features/reports/components/PeopleSection';
import { SeasonalitySection } from '@/features/reports/components/SeasonalitySection';
import { useReportData } from '@/features/reports/components/useReportData';
import { filterBills } from '@/features/reports';

type SectionKey = 'overview' | 'category' | 'seasonality' | 'lookup' | 'forecast' | 'people';

export default function ReportsScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const toast = useToast();
  const data = useReportData();
  const [section, setSection] = useState<SectionKey>('overview');
  const [exporting, setExporting] = useState(false);

  const options: { value: SectionKey; label: string }[] = [
    { value: 'overview', label: t('reports.overview') },
    { value: 'category', label: t('reports.byCategory') },
    { value: 'seasonality', label: t('reports.seasonality') },
    { value: 'lookup', label: t('reports.lookup') },
    { value: 'forecast', label: t('reports.forecast') },
    { value: 'people', label: data.house?.splitMode === 'FIXED_CONTRIBUTION' ? t('reports.balance') : t('reports.people') },
  ];

  const exportCsv = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const from = monthStart(addMonthsToKey(data.currentMonth, -11));
      const to = monthEnd(data.currentMonth);
      const rows = filterBills(data.bills, from, to);
      await exportBillsCsv(rows, data.categories, `costos-piso-${from}_${to}.csv`);
      haptics.success();
      toast.success(t('reportsUi.exportDone'));
    } catch {
      haptics.error();
      toast.error(t('reportsUi.exportError'));
    } finally {
      setExporting(false);
    }
  };

  const exportButton = (
    <Pressable
      onPress={() => void exportCsv()}
      accessibilityRole="button"
      accessibilityLabel={t('reports.exportCsv')}
      hitSlop={8}
      style={styles.export}
    >
      <Icon name="share" size={22} color={colors.tint} />
    </Pressable>
  );

  return (
    <Screen title={t('reports.title')} headerRight={exportButton} refreshing={data.isRefetching} onRefresh={data.refetch}>
      {!data.house && !data.isLoading ? (
        <EmptyState icon="home" title={t('home.noHouse')} />
      ) : (
        <View style={styles.body}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.segments}>
            {options.map((o) => (
              <Chip key={o.value} label={o.label} selected={section === o.value} onPress={() => setSection(o.value)} />
            ))}
          </ScrollView>

          {data.isLoading ? (
            <View style={styles.skeletons}>
              <Skeleton height={220} />
              <Skeleton height={120} />
            </View>
          ) : data.isError ? (
            <EmptyState icon="warning" title={t('common.error')} actionLabel={t('common.retry')} onAction={data.refetch} />
          ) : (
            <>
              {section === 'overview' ? <OverviewSection data={data} /> : null}
              {section === 'category' ? <CategorySection data={data} /> : null}
              {section === 'seasonality' ? <SeasonalitySection data={data} /> : null}
              {section === 'lookup' ? <LookupSection data={data} /> : null}
              {section === 'forecast' ? <ForecastSection data={data} /> : null}
              {section === 'people' ? <PeopleSection data={data} /> : null}
            </>
          )}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.lg, paddingHorizontal: spacing.lg },
  segments: { gap: spacing.sm, paddingVertical: spacing.xs },
  skeletons: { gap: spacing.md },
  export: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
