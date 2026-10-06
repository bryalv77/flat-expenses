import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, DatePickerField, EmptyState, MoneyInput, Screen, Section, TextField, useToast } from '@/components/ui';
import { useActiveHouse } from '@/features/houses/hooks';
import { useCreateGuestMember } from '@/features/members/hooks';
import { useT } from '@/i18n';
import { todayISO } from '@/lib/dates';
import { spacing } from '@/theme';

export default function NewGuestMemberScreen() {
  const { t } = useT();
  const router = useRouter();
  const toast = useToast();
  const { house, isAdmin } = useActiveHouse();
  const create = useCreateGuestMember(house?.id ?? '');
  const [name, setName] = useState('');
  const [joinedAt, setJoinedAt] = useState<string | null>(todayISO());
  const [removedAt, setRemovedAt] = useState<string | null>(null);
  const [cents, setCents] = useState<number | null>(null);

  if (!house || !isAdmin) return <Screen><EmptyState icon="lock" title={t('hub.adminOnly')} /></Screen>;

  const invalid = !name.trim() || !joinedAt || (removedAt !== null && removedAt < joinedAt);

  return (
    <Screen>
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.lg }}>
        <Section footer={t('hub.guestHelp')}>
          <TextField inline label={t('hub.guestName')} value={name} onChangeText={setName} />
          <DatePickerField label={t('hub.moveIn')} value={joinedAt} onChange={setJoinedAt} />
          <DatePickerField label={t('hub.moveOut')} value={removedAt} onChange={setRemovedAt} clearable />
          {house.splitMode === 'FIXED_CONTRIBUTION' ? <MoneyInput inline label={t('hub.individualContribution')} value={cents} onChange={setCents} /> : null}
        </Section>
        <Button
          title={t('common.save')}
          loading={create.isPending}
          disabled={invalid}
          onPress={() =>
            create.mutate(
              { displayName: name.trim(), joinedAt: joinedAt as string, removedAt, individualContributionCents: cents },
              { onSuccess: () => router.back(), onError: () => toast.error(t('errors.generic')) },
            )
          }
        />
      </View>
    </Screen>
  );
}
