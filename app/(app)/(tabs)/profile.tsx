import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Avatar, ListRow, Screen, Section, Text } from '@/components/ui';
import { LocalDataSection } from '@/components/LocalDataSection';
import { useAuth } from '@/features/auth';
import { leaveLocalMode } from '@/features/auth/appModeSwitch';
import { profileItems } from '@/features/profile/localMode';
import { getAppMode } from '@/lib/appMode';
import { useMe, useMyDocuments } from '@/features/profile/hooks';
import { useT } from '@/i18n';
import { useFileUrl } from '@/lib/useFileUrl';
import { spacing } from '@/theme';

export default function ProfileScreen() {
  const { t } = useT();
  const router = useRouter();
  const { authUser } = useAuth();
  const { data: user } = useMe();
  const { data: avatarUrl } = useFileUrl(user?.photoPath);
  const items = profileItems(getAppMode());
  const { data: docs } = useMyDocuments({ enabled: items.documents });
  const name = user?.displayName ?? authUser?.displayName ?? '';

  return (
    <Screen title={t('tabs.profile')}>
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.lg }}>
        <View style={{ alignItems: 'center', gap: spacing.sm }}>
          <Avatar name={name} uri={avatarUrl ?? undefined} size={88} />
          <Text variant="title2">{name}</Text>
          <Text variant="subhead" color="secondaryLabel">{user?.email ?? authUser?.email ?? ''}</Text>
        </View>
        <Section>
          <ListRow icon="person" title={t('profile.edit')} chevron onPress={() => router.push('/profile/edit')} />
          {items.documents ? (
            <ListRow
              icon="document"
              title={t('profile.documents')}
              value={String(docs?.length ?? 0)}
              chevron
              onPress={() => router.push('/profile/documents')}
            />
          ) : null}
        </Section>
        {items.localData ? <LocalDataSection /> : null}
        {items.dataLossNotice ? (
          <Section footer={t('localMode.dataLossNotice')}>
            <ListRow icon="logout" title={t('localMode.leave')} onPress={() => void leaveLocalMode()} />
          </Section>
        ) : null}
        <Section>
          <ListRow icon="settings" title={t('profile.settings')} chevron onPress={() => router.push('/settings')} />
        </Section>
      </View>
    </Screen>
  );
}
