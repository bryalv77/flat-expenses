import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ActionSheet, Badge, Button, Card, EmptyState, ListRow, Screen, Section, Text, useToast } from '@/components/ui';
import { BillFilePreview } from '@/features/bills/components/BillFilePreview';
import { useBill, useDeleteBill } from '@/features/bills/hooks';
import { useCategories } from '@/features/categories/hooks';
import { getEffectiveDate } from '@/features/finance';
import { useActiveHouse } from '@/features/houses/hooks';
import { useT } from '@/i18n';
import { formatDate, formatMoney } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { spacing, useTheme } from '@/theme';

export default function BillDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale } = useT();
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { house, isAdmin } = useActiveHouse();
  const bill = useBill(house?.id, id);
  const categories = useCategories(house?.id);
  const remove = useDeleteBill(house?.id ?? '');
  const [confirm, setConfirm] = useState(false);

  if (bill.isLoading) {
    return (
      <Screen>
        <ActivityIndicator color={colors.tint} style={styles.loading} />
      </Screen>
    );
  }
  if (!bill.data) {
    return (
      <Screen>
        <Stack.Screen options={{ title: t('expenses.title') }} />
        <EmptyState icon="document" title={t('billsUi.notFound')} />
      </Screen>
    );
  }

  const b = bill.data;
  const category = categories.data?.find((c) => c.id === b.categoryId);
  const dateOrDash = (iso: string | null) => (iso ? formatDate(iso, locale, 'medium') : '—');

  const doDelete = () => {
    remove.mutate(b, {
      onSuccess: () => {
        haptics.success();
        toast.success(t('billsUi.deleted'));
        router.back();
      },
      onError: () => toast.error(t('errors.generic')),
    });
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: category?.name ?? t('expenses.title') }} />
      <View style={styles.body}>
        <Card>
          <Text variant="footnote" color="secondaryLabel">
            {formatDate(getEffectiveDate(b), locale, 'long')}
          </Text>
          <Text variant="largeTitle">{formatMoney(b.amountCents, locale)}</Text>
          {category ? <Badge label={category.name} icon={category.icon} color={category.color} /> : null}
        </Card>

        <Section header={t('billsUi.details')}>
          <ListRow title={t('expenses.chargeDate')} value={dateOrDash(b.chargeDate)} />
          <ListRow title={t('expenses.periodStart')} value={dateOrDash(b.periodStartDate)} />
          <ListRow title={t('expenses.cutoffDate')} value={dateOrDash(b.periodEndDate)} />
          <ListRow title={t('billsUi.created')} value={dateOrDash(b.createdAt.slice(0, 10))} />
          {b.notes ? <ListRow title={t('expenses.notes')} subtitle={b.notes} /> : null}
        </Section>

        <View style={styles.file}>
          <Text variant="footnote" color="secondaryLabel">
            {t('billsUi.fileSection').toUpperCase()}
          </Text>
          <BillFilePreview bill={b} />
        </View>

        {isAdmin ? (
          <View style={styles.actions}>
            <Button title={t('common.edit')} variant="tinted" icon="edit" onPress={() => router.push(`/bills/${b.id}/edit`)} />
            <Button title={t('common.delete')} variant="plain" destructive icon="trash" onPress={() => setConfirm(true)} />
          </View>
        ) : null}
      </View>

      <ActionSheet
        visible={confirm}
        onClose={() => setConfirm(false)}
        title={t('expenses.deleteConfirm')}
        cancelLabel={t('common.cancel')}
        options={[{ label: t('common.delete'), destructive: true, onPress: doDelete }]}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: spacing.xxxl },
  body: { gap: spacing.lg, paddingHorizontal: spacing.lg },
  file: { gap: spacing.sm },
  actions: { gap: spacing.sm },
});
