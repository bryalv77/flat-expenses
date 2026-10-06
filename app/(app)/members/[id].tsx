import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { View } from 'react-native';

import { Badge, Button, EmptyState, ListRow, MoneyInput, Screen, Section, Text, useToast } from '@/components/ui';
import { ConfirmSheet } from '@/features/houses/ConfirmSheet';
import { useActiveHouse } from '@/features/houses/hooks';
import { useMyMember } from '@/features/houses/useMyMember';
import { isGuestMember, useReactivateMember, useRemoveMember, useSetMemberContribution } from '@/features/members/hooks';
import { MemberAvatar } from '@/features/members/MemberAvatar';
import { useMemberDocuments } from '@/features/profile/hooks';
import { useT } from '@/i18n';
import { formatDate, formatFileSize, formatMoney } from '@/lib/format';
import { getFileUrl } from '@/lib/storage';
import { spacing, useTheme } from '@/theme';

export default function MemberDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale } = useT();
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { house, isAdmin } = useActiveHouse();
  const houseId = house?.id ?? '';
  const { members } = useMyMember(house?.id);
  const member = members.find((m) => m.id === id);
  const remove = useRemoveMember(houseId);
  const reactivate = useReactivateMember(houseId);
  const setContribution = useSetMemberContribution(houseId);
  const { data: docs = [] } = useMemberDocuments(house?.id, member?.userId, isAdmin && Boolean(member) && !(member && isGuestMember(member)));
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [contribution, setLocalContribution] = useState<number | null | undefined>(undefined);

  if (!house || !isAdmin || !member) return <Screen><EmptyState icon="lock" title={t('hub.adminOnly')} /></Screen>;

  const value = contribution === undefined ? member.individualContributionCents : contribution;
  const isRoommate = member.role === 'ROOMMATE';
  const guest = isGuestMember(member);

  const openDoc = async (path: string) => {
    try {
      await WebBrowser.openBrowserAsync(await getFileUrl(path));
    } catch {
      toast.error(t('errors.generic'));
    }
  };

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
          <Text variant="footnote" color="secondaryLabel">{`${t('hub.joined')} ${formatDate(member.joinedAt.slice(0, 10), locale, 'medium')}`}</Text>
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
                    { onSuccess: () => toast.success(t('hub.saved')), onError: () => toast.error(t('errors.generic')) },
                  )
                }
              />
            </View>
          </Section>
        ) : null}

        {guest ? null : <Section header={t('hub.memberDocs')} footer={t('hub.adminOnlySensitive')}>
          {docs.length === 0 ? <ListRow icon="lock" iconColor={colors.orange} title={t('hub.noDocs')} /> : null}
          {docs.map((d) => (
            <ListRow
              key={d.id}
              icon="document"
              iconColor={colors.orange}
              title={d.type === 'PASSPORT' ? t('profile.passport') : t('profile.nationalId')}
              subtitle={`${d.fileName} · ${formatFileSize(d.sizeBytes)}`}
              value={t('hub.openFile')}
              onPress={() => void openDoc(d.storagePath)}
            />
          ))}
        </Section>}

        {member.role !== 'ADMIN' ? (
          member.status === 'ACTIVE' ? (
            <Button title={t('house.remove')} variant="tinted" destructive onPress={() => setConfirmRemove(true)} />
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
          remove.mutate(member.id, { onSuccess: () => router.back(), onError: () => toast.error(t('errors.generic')) });
        }}
      />
    </Screen>
  );
}
