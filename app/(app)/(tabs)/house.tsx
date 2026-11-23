import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';
import { z } from 'zod';

import { Badge, Button, ConfirmSheet, EmptyState, ListRow, MoneyInput, Screen, Section, SegmentedControl, Switch, TextField, useToast } from '@/components/ui';
import { useAuth } from '@/features/auth';
import { houseSchema, parseDayInput } from '@/features/houses/houseFields';
import { useActiveHouse, useDeleteHouse, useUpdateHouse } from '@/features/houses/hooks';
import { useMyMember } from '@/features/houses/useMyMember';
import { isGuestMember, useLeaveHouse } from '@/features/members/hooks';
import { MemberAvatar } from '@/features/members/MemberAvatar';
import { houseActions } from '@/features/profile/localMode';
import { useT } from '@/i18n';
import { getAppMode } from '@/lib/appMode';
import { formatDate } from '@/lib/format';
import { spacing } from '@/theme';
import type { SplitMode } from '@/types/domain';

const makeSchema = (t: ReturnType<typeof useT>['t']) => houseSchema(t, { showBalanceToRoommates: z.boolean() });
type FormValues = z.infer<ReturnType<typeof makeSchema>>;

export default function HouseScreen() {
  const { t, locale } = useT();
  const router = useRouter();
  const toast = useToast();
  const { authUser } = useAuth();
  const actions = houseActions(getAppMode());
  const { house, isAdmin, isLoading } = useActiveHouse();
  const { members } = useMyMember(house?.id);
  const update = useUpdateHouse();
  const deleteHouse = useDeleteHouse();
  const leave = useLeaveHouse();
  const [confirm, setConfirm] = useState<'delete' | 'leave' | null>(null);
  const schema = useMemo(() => makeSchema(t), [t]);

  const { control, handleSubmit, reset, watch, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', address: '', splitMode: 'EQUAL', fixedContributionCents: null, contributionDayOfMonth: null, showBalanceToRoommates: true },
  });
  useEffect(() => {
    if (house) {
      reset({
        name: house.name,
        address: house.address ?? '',
        splitMode: house.splitMode,
        fixedContributionCents: house.fixedContributionCents,
        contributionDayOfMonth: house.contributionDayOfMonth,
        showBalanceToRoommates: house.showBalanceToRoommates,
      });
    }
  }, [house, reset]);
  const splitMode = watch('splitMode');

  if (!house) {
    return (
      <Screen title={t('tabs.house')}>
        {isLoading ? null : <EmptyState icon="home" title={t('home.noHouse')} actionLabel={t('onboarding.createHouse')} onAction={() => router.push('/onboarding/role')} />}
      </Screen>
    );
  }

  const onSave = handleSubmit(async (v) => {
    try {
      await update.mutateAsync({
        houseId: house.id,
        name: v.name,
        address: v.address || null,
        splitMode: v.splitMode,
        fixedContributionCents: v.splitMode === 'FIXED_CONTRIBUTION' ? v.fixedContributionCents : null,
        contributionDayOfMonth: v.splitMode === 'FIXED_CONTRIBUTION' ? v.contributionDayOfMonth : null,
        showBalanceToRoommates: v.showBalanceToRoommates,
      });
      toast.success(t('hub.saved'));
    } catch (e) {
      toast.fail(e);
    }
  });

  const runConfirmed = async () => {
    const action = confirm;
    setConfirm(null);
    try {
      if (action === 'delete') await deleteHouse.mutateAsync(house.id);
      if (action === 'leave') await leave.mutateAsync(house.id);
      router.replace('/');
    } catch (e) {
      toast.fail(e);
    }
  };

  const sorted = [...members].sort((a, b) => Number(a.status === 'REMOVED') - Number(b.status === 'REMOVED'));

  return (
    <Screen title={house.name}>
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.lg }}>
        <Section header={t('hub.manage')}>
          <ListRow icon="folder" title={t('hub.categoriesLink')} chevron onPress={() => router.push('/categories')} />
          {isAdmin ? (
            <>
              <ListRow icon="card" title={t('hub.paymentsLink')} chevron onPress={() => router.push('/payments')} />
              {actions.invite ? <ListRow icon="plus" title={t('hub.inviteLink')} chevron onPress={() => router.push('/members/invite')} /> : null}
              <ListRow icon="plus" title={t('hub.addGuest')} chevron onPress={() => router.push('/members/new')} />
            </>
          ) : null}
        </Section>

        <Section header={t('house.members')}>
          {sorted.length === 0 ? <ListRow title={t('hub.noRoommates')} /> : null}
          {sorted.map((m) => (
            <ListRow
              key={m.id}
              leading={<MemberAvatar name={m.displayName} photoPath={m.photoPath} />}
              title={m.userId === authUser?.uid ? `${m.displayName} (${t('hub.youTag')})` : m.displayName}
              subtitle={`${t('hub.joined')} ${formatDate(m.joinedAt, locale, 'medium')}${m.removedAt ? ` → ${formatDate(m.removedAt, locale, 'medium')}` : ''}`}
              meta={
                <>
                  <Badge small label={m.role === 'ADMIN' ? t('house.admin') : t('house.roommate')} tone={m.role === 'ADMIN' ? 'blue' : 'neutral'} />
                  {isGuestMember(m) ? <Badge small label={t('hub.noAccount')} tone="neutral" /> : null}
                  {m.status === 'REMOVED' ? <Badge small label={t('house.removed')} tone="red" /> : null}
                </>
              }
              chevron={isAdmin}
              onPress={isAdmin ? () => router.push({ pathname: '/members/[id]', params: { id: m.id } }) : undefined}
            />
          ))}
        </Section>

        {isAdmin ? (
          <View style={{ gap: spacing.lg }}>
            <Section header={t('house.settings')} footer={t('hub.splitModeHelp')}>
              <Controller control={control} name="name" render={({ field }) => <TextField label={t('hub.houseName')} inline value={field.value} onChangeText={field.onChange} error={formState.errors.name ? t('hub.nameRequired') : undefined} />} />
              <Controller control={control} name="address" render={({ field }) => <TextField label={t('onboarding.address')} inline value={field.value ?? ''} onChangeText={field.onChange} />} />
            </Section>
            <Controller
              control={control}
              name="splitMode"
              render={({ field }) => (
                <SegmentedControl<SplitMode>
                  value={field.value}
                  onChange={field.onChange}
                  options={[
                    { value: 'EQUAL', label: t('onboarding.equal') },
                    { value: 'FIXED_CONTRIBUTION', label: t('onboarding.fixed') },
                  ]}
                />
              )}
            />
            {splitMode === 'FIXED_CONTRIBUTION' ? (
              <Section>
                <Controller control={control} name="fixedContributionCents" render={({ field, fieldState }) => <MoneyInput inline label={t('onboarding.fixedAmount')} value={field.value} onChange={field.onChange} error={fieldState.error?.message} />} />
                <Controller
                  control={control}
                  name="contributionDayOfMonth"
                  render={({ field }) => (
                    <TextField
                      inline
                      label={t('hub.contributionDay')}
                      keyboardType="number-pad"
                      value={field.value === null ? '' : String(field.value)}
                      onChangeText={(s) => field.onChange(parseDayInput(s))}
                    />
                  )}
                />
              </Section>
            ) : null}
            <Section>
              <Controller
                control={control}
                name="showBalanceToRoommates"
                render={({ field }) => <ListRow title={t('house.showBalance')} trailing={<Switch value={field.value} onValueChange={field.onChange} accessibilityLabel={t('house.showBalance')} />} />}
              />
            </Section>
            <Button title={t('hub.saveChanges')} loading={update.isPending} onPress={onSave} />
            <Button title={t('house.deleteHouse')} variant="tinted" destructive onPress={() => setConfirm('delete')} />
          </View>
        ) : (
          <Button title={t('house.leave')} variant="tinted" destructive onPress={() => setConfirm('leave')} />
        )}
      </View>
      <ConfirmSheet
        visible={confirm !== null}
        title={confirm === 'delete' ? t('hub.deleteHouseConfirm') : t('hub.leaveConfirm')}
        confirmLabel={confirm === 'delete' ? t('house.deleteHouse') : t('house.leave')}
        onConfirm={() => void runConfirmed()}
        onClose={() => setConfirm(null)}
      />
    </Screen>
  );
}
