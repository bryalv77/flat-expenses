import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button, ListRow, Screen, Section, Text } from '@/components/ui';
import { useAuth } from '@/features/auth';
import { useT } from '@/i18n';
import { spacing } from '@/theme';

export default function RoleScreen() {
  const { t } = useT();
  const router = useRouter();
  const { signOut } = useAuth();
  return (
    <Screen>
      <View style={styles.header}>
        <Text variant="largeTitle">{t('onboarding.roleTitle')}</Text>
      </View>
      <Section>
        <ListRow
          icon="key"
          title={t('onboarding.admin')}
          subtitle={t('onboarding.adminDesc')}
          chevron
          onPress={() => router.push('/onboarding/create-house')}
        />
        <ListRow
          icon="people"
          title={t('onboarding.roommate')}
          subtitle={t('onboarding.roommateDesc')}
          chevron
          onPress={() => router.push('/onboarding/join-house')}
        />
      </Section>
      <View style={styles.footer}>
        <Button title={t('auth.signOut')} variant="plain" destructive onPress={() => void signOut()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
});
