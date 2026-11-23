import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Badge, Button, ConfirmSheet, DatePickerField, MoneyInput, Screen, Section, Text, useToast } from '@/components/ui';
import { AdminOnlyScreen } from '@/features/houses/AdminOnlyScreen';
import { useActiveHouse } from '@/features/houses/hooks';
import { useMyMember } from '@/features/houses/useMyMember';
import { isGuestMember, useReactivateMember, useRemoveMember, useSetMemberContribution } from '@/features/members/hooks';
import { MemberAvatar } from '@/features/members/MemberAvatar';
import { useT } from '@/i18n';
import { dayOf, todayISO } from '@/lib/dates';
import { formatDate, formatMoney } from '@/lib/format';
import { spacing } from '@/theme';

export default function MemberDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale } = useT();
  const router = useRouter();
  const toast = useToast();
  const { house, isAdmin } = useActiveHouse();
  const houseId = house?.id ?? '';
  const { members } = useMyMember(house?.id);
  const member = members.find((m) => m.id === id);
  const remove = useRemoveMember(houseId);
  const reactivate = useReactivateMember(houseId);
  const setContribution = useSetMemberContribution(houseId);
  const [leftOn, setLeftOn] = useState<string | null>(todayISO());
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [contribution, setLocalContribution] = useState<number | null | undefined>(undefined);

  if (!house || !isAdmin || !member) return <AdminOnlyScreen />;

  const value = contribution === undefined ? member.individualContributionCents : contribution;
  const isRoommate = member.role === 'ROOMMATE';
  const guest = isGuestMember(member);

  return (
    <Screen>
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.lg }}>
        <View style={{ alignItems: 'center', gap: spacing.sm }}>
          <MemberAvatar name={member.displayName} photoPath={member.photoPath} size={80} />
          <Text variant="title2">{member.displayName}</Text>
          <Text color="secondaryLabel">{guest ? t('hub.noAccount') : member.email}</Text>
          <View style={{ flexDirection: 'row', gap: spacing.xs }}>
            <Badge label={member.role === 'ADMIN' ? t('house.admin') : t('house.roommate')} tone={member.role === 'ADMIN' ? 'blue' : 'neutral'} />
            {member.status === 'REMOVED' ? <Badge label={t('house.removed')} tone="red" /> : null}
          </View>
          <Text variant="footnote" color="secondaryLabel">{`${t('hub.joined')} ${formatDate(member.joinedAt, locale, 'medium')}`}</Text>
        </View>

        {isRoommate && house.splitMode === 'FIXED_CONTRIBUTION' ? (
          <Section header={t('hub.individualContribution')} footer={`${t('hub.inheritHouse')}: ${formatMoney(house.fixedContributionCents ?? 0, locale)}`}>
            <MoneyInput inline label={t('hub.individualContribution')} value={value ?? null} onChange={setLocalContribution} />
            <View style={{ padding: spacing.md }}>
              <Button
                title={t('common.save')}
                variant="tinted"
                loading={setContribution.isPending}
                disabled={contribution === undefined}
                onPress={() =>
                  setContribution.mutate(
                    { memberId: member.id, cents: contribution ?? null },
                    { onSuccess: () => toast.success(t('hub.saved')), onError: toast.fail },
                  )
                }
              />
            </View>
          </Section>
        ) : null}

        {member.role !== 'ADMIN' ? (
          member.status === 'ACTIVE' ? (
            <>
              <Section>
                <DatePickerField label={t('hub.moveOut')} value={leftOn} onChange={setLeftOn} />
              </Section>
              <Button title={t('house.remove')} variant="tinted" destructive disabled={!leftOn || leftOn < dayOf(member.joinedAt)} onPress={() => setConfirmRemove(true)} />
            </>
          ) : (
            <Button title={t('house.reactivate')} variant="tinted" loading={reactivate.isPending} onPress={() => reactivate.mutate(member.id)} />
          )
        ) : null}
      </View>
      <ConfirmSheet
        visible={confirmRemove}
        title={t('hub.removeConfirm')}
        confirmLabel={t('house.remove')}
        onClose={() => setConfirmRemove(false)}
        onConfirm={() => {
          setConfirmRemove(false);
          remove.mutate({ memberId: member.id, removedAt: leftOn as string }, { onSuccess: () => router.back(), onError: toast.fail });
        }}
      />
    </Screen>
  );
}
