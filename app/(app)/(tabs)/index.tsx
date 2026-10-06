import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { DonutChart } from '@/components/charts';
import { Avatar, Button, Card, EmptyState, ListRow, Screen, Section, Skeleton, Text } from '@/components/ui';
import { useAuth } from '@/features/auth';
import { computeMonthBalance, computeMonthShares, computePaymentStatus } from '@/features/finance';
import { useActiveHouse } from '@/features/houses/hooks';
import { useMyMember } from '@/features/houses/useMyMember';
import { useBills } from '@/features/bills/hooks';
import { useCategories } from '@/features/categories/hooks';
import { usePayments } from '@/features/payments/hooks';
import { useMe, useMyDocuments } from '@/features/profile/hooks';
import { categoryBreakdown, computeDelta, filterBills, sumCents } from '@/features/reports';
import { describeSchedule } from '@/features/schedule/occurrences';
import { getSmartUpcoming } from '@/features/schedule/smartUpcoming';
import { useT } from '@/i18n';
import { addMonthsToKey, monthEnd, monthKey, monthStart, todayISO } from '@/lib/dates';
import { formatDate, formatMoney, formatMonth, formatPercent } from '@/lib/format';
import { useFileUrl } from '@/lib/useFileUrl';
import { spacing, useTheme } from '@/theme';

export default function HomeScreen() {
  const { t, locale } = useT();
  const { colors } = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const { firebaseUser } = useAuth();
  const { house, isAdmin, isLoading: houseLoading } = useActiveHouse();
  const { me: myMember, members } = useMyMember(house?.id);
  const { data: user } = useMe();
  const { data: avatarUrl } = useFileUrl(user?.photoPath);
  const { data: docs, isSuccess: docsLoaded } = useMyDocuments();
  const { data: categories = [] } = useCategories(house?.id);
  const [refreshing, setRefreshing] = useState(false);

  const today = todayISO();
  const month = monthKey(today);
  const prevMonth = addMonthsToKey(month, -1);
  // 3 years of history feed the smart upcoming-charges predictor (cadence + seasonality + growth).
  const { data: bills = [], isLoading: billsLoading } = useBills(house?.id, { from: monthStart(addMonthsToKey(month, -35)), to: monthEnd(month) });
  const { data: payments = [] } = usePayments(house?.id, { from: monthStart(month), to: monthEnd(month) });

  const view = useMemo(() => {
    if (!house) return null;
    const current = filterBills(bills, monthStart(month), monthEnd(month));
    const previous = filterBills(bills, monthStart(prevMonth), monthEnd(prevMonth));
    const total = sumCents(current);
    const delta = computeDelta(total, sumCents(previous));
    const breakdown = categoryBreakdown(current);
    const shares = computeMonthShares(bills, members, month);
    const myShare = shares.perMember.find((s) => s.memberId === myMember?.id)?.cents ?? 0;
    const balance = computeMonthBalance(house, members, month, total);
    const paymentSummary = computePaymentStatus(house, members, payments, month);
    const myPayment = paymentSummary.perMember.find((p) => p.memberId === myMember?.id);
    const upcoming = getSmartUpcoming(categories, bills, today, 1);
    return { total, delta, breakdown, shares, myShare, balance, paymentSummary, myPayment, upcoming };
  }, [house, bills, members, month, prevMonth, payments, categories, today, myMember?.id]);

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const onRefresh = async () => {
    setRefreshing(true);
    await qc.invalidateQueries();
    setRefreshing(false);
  };

  const name = user?.displayName ?? firebaseUser?.displayName ?? '';
  const isFixed = house?.splitMode === 'FIXED_CONTRIBUTION';
  const showBalance = isAdmin || house?.showBalanceToRoommates !== false;

  if (!house && !houseLoading) {
    return (
      <Screen title={t('tabs.home')}>
        <EmptyState icon="home" title={t('home.noHouse')} actionLabel={t('onboarding.createHouse')} onAction={() => router.push('/onboarding/role')} />
      </Screen>
    );
  }

  const statusLabel = view?.balance.status === 'SURPLUS' ? t('hub.statusSurplus') : view?.balance.status === 'INSUFFICIENT' ? t('hub.statusInsufficient') : t('hub.statusSufficient');
  const statusColor = view?.balance.status === 'INSUFFICIENT' ? 'red' : 'green';

  return (
    <Screen title={t('tabs.home')} refreshing={refreshing} onRefresh={onRefresh}>
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Avatar name={name} uri={avatarUrl ?? undefined} size={48} />
          <View style={{ flex: 1 }}>
            <Text variant="title3">{`${t('home.greeting')}, ${name.split(' ')[0] ?? ''}`}</Text>
            <Text variant="subhead" color="secondaryLabel">{house?.name ?? ''}</Text>
          </View>
        </View>

        {docsLoaded && (docs?.length ?? 0) === 0 ? (
          <Card>
            <ListRow icon="document" iconColor={colors.orange} title={t('home.docsBanner')} chevron onPress={() => router.push('/profile/documents')} />
          </Card>
        ) : null}

        {!view || billsLoading ? (
          <Skeleton height={140} radius={16} />
        ) : (
          <Card>
            <Text variant="footnote" color="secondaryLabel">{t('hub.monthTotal')}</Text>
            <Text variant="largeTitle">{formatMoney(view.total, locale)}</Text>
            {view.delta.ratio !== null ? (
              <Text variant="subhead" color={view.delta.deltaCents > 0 ? 'red' : 'green'}>
                {`${view.delta.deltaCents > 0 ? '↑' : '↓'} ${formatPercent(Math.abs(view.delta.ratio), locale, 0)} ${t('home.vsPrevious')}`}
              </Text>
            ) : (
              <Text variant="subhead" color="secondaryLabel">{t('hub.noData')}</Text>
            )}
          </Card>
        )}

        {view && !isFixed ? (
          <Section header={t('home.perPerson')}>
            <ListRow icon="person" title={t('home.yourShare')} value={formatMoney(view.myShare, locale)} />
            {view.shares.memberIds.length > 0 ? (
              <ListRow icon="people" title={`${view.shares.memberIds.length} ${t('hub.members')}`} value={formatMoney(view.shares.perMember[0]?.cents ?? 0, locale)} />
            ) : null}
          </Section>
        ) : null}

        {view && isFixed ? (
          <Section header={t('home.contribution')}>
            {view.myPayment ? (
              <ListRow
                icon="card"
                title={t('hub.yourPayments')}
                subtitle={`${t('hub.due')} ${formatMoney(view.myPayment.dueCents, locale)}`}
                value={view.myPayment.pendingCents === 0 ? t('home.paid') : `${t('home.pending')} ${formatMoney(view.myPayment.pendingCents, locale)}`}
              />
            ) : null}
            {showBalance ? (
              <>
                <ListRow icon="euro" title={t('hub.expectedIncome')} value={formatMoney(view.balance.expectedIncomeCents, locale)} />
                <ListRow
                  icon={view.balance.status === 'INSUFFICIENT' ? 'warning' : 'checkCircle'}
                  iconColor={colors[statusColor]}
                  title={statusLabel}
                  subtitle={view.balance.status === 'INSUFFICIENT' ? t('hub.short') : view.balance.status === 'SURPLUS' ? t('hub.surplus') : undefined}
                  value={formatMoney(Math.abs(view.balance.balanceCents), locale)}
                />
              </>
            ) : null}
          </Section>
        ) : null}

        {view && view.breakdown.length > 0 ? (
          <Card>
            <Text variant="headline" style={{ marginBottom: spacing.md }}>{t('home.byCategory')}</Text>
            <DonutChart
              slices={view.breakdown.map((b) => ({
                key: b.categoryId,
                label: categoryById.get(b.categoryId)?.name ?? '—',
                value: b.totalCents,
                color: categoryById.get(b.categoryId)?.color ?? colors.gray,
              }))}
              centerLabel={t('hub.monthTotal')}
              centerValue={formatMoney(view.total, locale, { compact: true })}
              onSelect={() => undefined}
            />
          </Card>
        ) : null}

        <Section header={t('home.upcoming')}>
          {view && view.upcoming.length > 0 ? (
            view.upcoming.map((u) => {
              const range = u.lowCents != null && u.highCents != null && u.lowCents !== u.highCents ? ` (${formatMoney(u.lowCents, locale)}–${formatMoney(u.highCents, locale)})` : '';
              const when = u.date ? (u.date === today ? t('hub.today') : formatDate(u.date, locale, 'medium')) : formatMonth(u.month, locale, 'long');
              const every = u.everyMonths ? ` · ${describeSchedule({ intervalUnit: 'MONTH', intervalCount: u.everyMonths, amountType: 'VARIABLE', expectedAmountCents: null }, locale).interval}` : '';
              return (
                <ListRow
                  key={`${u.category.id}-${u.month}`}
                  icon={u.category.icon as never}
                  iconColor={u.category.color}
                  title={u.category.name}
                  subtitle={`${when}${every}${range}`}
                  value={u.estimateCents ? `${u.basis === 'STABLE' || u.basis === 'SCHEDULE' ? '' : '~'}${formatMoney(u.estimateCents, locale)}` : t('hub.variable')}
                />
              );
            })
          ) : (
            <ListRow title={t('home.noUpcoming')} />
          )}
        </Section>

        {isAdmin ? <Button title={t('home.addBill')} icon="plus" onPress={() => router.push('/bills/new')} /> : null}
      </View>
    </Screen>
  );
}
