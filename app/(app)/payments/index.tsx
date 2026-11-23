import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Badge, BottomSheet, Button, Chip, ListRow, MoneyInput, Screen, Section, Text, TextField, useToast } from '@/components/ui';
import { computePaymentStatus } from '@/features/finance';
import { AdminOnlyScreen } from '@/features/houses/AdminOnlyScreen';
import { useActiveHouse } from '@/features/houses/hooks';
import { useMyMember } from '@/features/houses/useMyMember';
import { MemberAvatar } from '@/features/members/MemberAvatar';
import { useDeletePayment, usePayments, useRecordPayment } from '@/features/payments/hooks';
import { useT } from '@/i18n';
import { monthEnd, monthKey, monthRange, monthStart, todayISO } from '@/lib/dates';
import { formatDate, formatMonth, formatMoney } from '@/lib/format';
import { spacing } from '@/theme';

type Tone = 'neutral' | 'blue' | 'green' | 'red' | 'orange';

export default function PaymentsScreen() {
  const { t, locale } = useT();
  const toast = useToast();
  const { house, isAdmin } = useActiveHouse();
  const houseId = house?.id ?? '';
  const { members } = useMyMember(house?.id);
  const thisMonth = monthKey(todayISO());
  const [month, setMonth] = useState(thisMonth);
  const { data: payments = [] } = usePayments(house?.id, { from: monthStart(month), to: monthEnd(month) });
  const record = useRecordPayment(houseId);
  const del = useDeletePayment(houseId);
  const [sheetMember, setSheetMember] = useState<string | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [note, setNote] = useState('');

  const summary = useMemo(() => (house ? computePaymentStatus(house, members, payments, month) : null), [house, members, payments, month]);
  // Every month since the earliest member joined, newest first.
  const allMonths = useMemo(() => {
    const first = members.reduce((min, m) => (m.joinedAt.slice(0, 7) < min ? m.joinedAt.slice(0, 7) : min), thisMonth);
    return monthRange(first, thisMonth).reverse();
  }, [members, thisMonth]);
  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  if (!house || !isAdmin) return <AdminOnlyScreen />;

  const stateTone: Record<string, [Tone, string]> = {
    PAID: ['green', t('hub.paymentStatusPaid')],
    PARTIAL: ['orange', t('hub.paymentStatusPartial')],
    PENDING: ['red', t('hub.paymentStatusPending')],
    OVERPAID: ['blue', t('hub.paymentStatusOver')],
  };

  const openSheet = (memberId: string, pending: number) => {
    setSheetMember(memberId);
    setAmount(pending > 0 ? pending : null);
    setNote('');
  };

  const save = () => {
    if (!sheetMember || !amount || amount <= 0) return;
    record.mutate(
      { memberId: sheetMember, month: monthStart(month), amountCents: amount, note: note || undefined },
      {
        onSuccess: () => {
          setSheetMember(null);
          toast.success(t('hub.saved'));
        },
        onError: toast.fail,
      },
    );
  };

  return (
    <Screen>
      <View style={{ gap: spacing.lg }}>
        {house.splitMode !== 'FIXED_CONTRIBUTION' ? <Text variant="footnote" color="secondaryLabel">{t('hub.onlyFixedMode')}</Text> : null}

        <Text variant="footnote" color="secondaryLabel">{t('hub.recordPaymentHint')}</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: spacing.sm, alignItems: 'center' }}>
          {allMonths.map((m) => (
            <Chip key={m} label={formatMonth(m, locale, 'short')} selected={m === month} onPress={() => setMonth(m)} />
          ))}
        </ScrollView>

        {summary ? (
          <Section header={formatMonth(month, locale, 'long')} footer={`${t('hub.due')} ${formatMoney(summary.totalDueCents, locale)} · ${t('hub.paidTotal')} ${formatMoney(summary.totalPaidCents, locale)} · ${t('hub.pendingTotal')} ${formatMoney(summary.totalPendingCents, locale)}`}>
            {summary.perMember.length === 0 ? <ListRow title={t('hub.noRoommates')} /> : null}
            {summary.perMember.map((p) => {
              const m = byId.get(p.memberId);
              const [tone, label] = stateTone[p.state] ?? ['neutral', p.state];
              return (
                <ListRow
                  key={p.memberId}
                  leading={m ? <MemberAvatar name={m.displayName} photoPath={m.photoPath} /> : undefined}
                  title={m?.displayName ?? '—'}
                  subtitle={`${formatMoney(p.paidCents, locale)} / ${formatMoney(p.dueCents, locale)}`}
                  trailing={<Badge label={label} tone={tone} />}
                  chevron onPress={() => openSheet(p.memberId, p.pendingCents)}
                />
              );
            })}
          </Section>
        ) : null}

        <Section header={t('house.payments')}>
          {payments.length === 0 ? <ListRow title={t('hub.noData')} /> : null}
          {payments.map((p) => (
            <ListRow
              key={p.id}
              icon="card"
              title={byId.get(p.memberId)?.displayName ?? '—'}
              subtitle={`${formatDate(p.paidAt, locale, 'medium')}${p.note ? ` · ${p.note}` : ''}`}
              value={formatMoney(p.amountCents, locale)}
              swipeActions={[{ label: t('common.delete'), destructive: true, onPress: () => del.mutate(p.id, { onError: toast.fail }) }]}
            />
          ))}
        </Section>
      </View>

      <BottomSheet visible={sheetMember !== null} onClose={() => setSheetMember(null)} title={t('house.recordPayment')}>
        <View style={{ gap: spacing.md, paddingBottom: spacing.lg }}>
          <MoneyInput label={t('hub.amountPaid')} value={amount} onChange={setAmount} />
          <TextField label={t('hub.note')} value={note} onChangeText={setNote} />
          <Button title={t('common.save')} loading={record.isPending} disabled={!amount} onPress={save} />
        </View>
      </BottomSheet>
    </Screen>
  );
}
