import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Platform, Share, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Badge, Button, EmptyState, ListRow, Screen, Section, SegmentedControl, Text, useToast } from '@/components/ui';
import { useActiveHouse } from '@/features/houses/hooks';
import { formatInviteCode } from '@/features/members/inviteCode';
import { useCreateInvite, useInvites, useRevokeInvite } from '@/features/members/hooks';
import { useT } from '@/i18n';
import { formatDate } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { spacing, useTheme } from '@/theme';

const EXPIRY_OPTIONS = [
  { value: '1', label: '1' },
  { value: '7', label: '7' },
  { value: '30', label: '30' },
];
const USES_OPTIONS = [
  { value: '1', label: '1' },
  { value: '3', label: '3' },
  { value: '10', label: '10' },
];

export default function InviteScreen() {
  const { t, locale } = useT();
  const { colors } = useTheme();
  const toast = useToast();
  const { house, isAdmin } = useActiveHouse();
  const houseId = house?.id ?? '';
  const { data: invites = [] } = useInvites(house?.id, isAdmin);
  const create = useCreateInvite(houseId);
  const revoke = useRevokeInvite(houseId);
  const [expiry, setExpiry] = useState('7');
  const [uses, setUses] = useState('1');
  const [code, setCode] = useState<string | null>(null);

  if (!house || !isAdmin) return <Screen><EmptyState icon="lock" title={t('hub.adminOnly')} /></Screen>;

  const generate = async () => {
    try {
      const c = await create.mutateAsync({ expiresInDays: Number(expiry), maxUses: Number(uses) });
      setCode(c);
      haptics.success();
    } catch {
      toast.error(t('errors.generic'));
    }
  };

  const copy = async (c: string) => {
    await Clipboard.setStringAsync(formatInviteCode(c));
    haptics.success();
    toast.success(t('common.copied'));
  };

  const share = async (c: string) => {
    const message = t('hub.shareMessage', { code: formatInviteCode(c) });
    try {
      if (Platform.OS === 'web' && !(typeof navigator !== 'undefined' && 'share' in navigator)) {
        await Clipboard.setStringAsync(message);
        toast.success(t('common.copied'));
      } else {
        await Share.share({ message });
      }
    } catch {
      // user dismissed the share sheet
    }
  };

  const active = invites.filter((i) => i.status === 'ACTIVE');

  return (
    <Screen>
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.lg }}>
        <Section header={t('hub.expiresIn')}>
          <View style={{ padding: spacing.md }}>
            <SegmentedControl value={expiry} onChange={setExpiry} options={EXPIRY_OPTIONS} />
          </View>
        </Section>
        <Section header={t('house.maxUses')}>
          <View style={{ padding: spacing.md }}>
            <SegmentedControl value={uses} onChange={setUses} options={USES_OPTIONS} />
          </View>
        </Section>
        <Button title={code ? t('hub.newCode') : t('house.generateCode')} icon="qr" loading={create.isPending} onPress={() => void generate()} />

        {code ? (
          <View style={{ alignItems: 'center', gap: spacing.md, padding: spacing.lg, backgroundColor: colors.grouped, borderRadius: 16 }}>
            <Text variant="footnote" color="secondaryLabel">{t('hub.codeReady')}</Text>
            <Text variant="largeTitle" selectable style={{ letterSpacing: 4 }}>{formatInviteCode(code)}</Text>
            <View style={{ padding: spacing.md, backgroundColor: '#FFFFFF', borderRadius: 12 }}>
              <QRCode value={code} size={160} />
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.md, alignSelf: 'stretch' }}>
              <View style={{ flex: 1 }}><Button title={t('common.copy')} icon="copy" variant="tinted" onPress={() => void copy(code)} /></View>
              <View style={{ flex: 1 }}><Button title={t('common.share')} icon="share" variant="tinted" onPress={() => void share(code)} /></View>
            </View>
          </View>
        ) : null}

        <Section header={t('hub.activeInvites')}>
          {active.length === 0 ? <ListRow title={t('hub.noInvites')} /> : null}
          {active.map((i) => (
            <ListRow
              key={i.id}
              title={formatInviteCode(i.code)}
              subtitle={`${t('house.expiry')} ${formatDate(i.expiresAt.slice(0, 10), locale, 'medium')}`}
              trailing={<Badge label={`${i.usedCount}/${i.maxUses}`} tone="blue" />}
              onPress={() => void copy(i.code)}
              swipeActions={[{ label: t('house.revoke'), destructive: true, onPress: () => revoke.mutate(i.id) }]}
            />
          ))}
        </Section>
      </View>
    </Screen>
  );
}
