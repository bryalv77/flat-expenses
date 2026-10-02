import { Stack } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  ActionSheet,
  BottomSheet,
  Button,
  Icon,
  ListRow,
  Screen,
  SegmentedControl,
  Section,
  Text,
  TextField,
} from '@/components/ui';
import { useAuth } from '@/features/auth';
import { reauthErrorKey } from '@/features/auth/errors';
import { useMyHouses } from '@/features/houses/hooks';
import { useUpdateProfile } from '@/features/profile/hooks';
import { useT } from '@/i18n';
import { haptics } from '@/lib/haptics';
import { useUiStore } from '@/lib/uiStore';
import { spacing, useTheme, type ThemeMode } from '@/theme';
import type { Locale } from '@/types/domain';

export default function SettingsScreen() {
  const { t } = useT();
  const { colors, mode, setMode } = useTheme();
  const { signOut, deleteAccount, isPasswordAccount } = useAuth();
  const locale = useUiStore((s) => s.locale);
  const setLocale = useUiStore((s) => s.setLocale);
  const activeHouseId = useUiStore((s) => s.activeHouseId);
  const setActiveHouseId = useUiStore((s) => s.setActiveHouseId);
  const houses = useMyHouses();
  const updateProfile = useUpdateProfile();

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const themeOptions: { value: ThemeMode; label: string }[] = [
    { value: 'system', label: t('profile.system') },
    { value: 'light', label: t('profile.light') },
    { value: 'dark', label: t('profile.dark') },
  ];
  const localeOptions: { value: Locale; label: string }[] = [
    { value: 'es', label: 'Español' },
    { value: 'en', label: 'English' },
  ];

  const changeLocale = (next: Locale) => {
    setLocale(next);
    updateProfile.mutate({ locale: next });
  };

  const runDelete = async () => {
    setDeleteError(null);
    setDeleting(true);
    try {
      await deleteAccount(isPasswordAccount ? password : undefined);
      haptics.success();
    } catch (e) {
      haptics.error();
      setDeleteError(t(reauthErrorKey(e)));
    } finally {
      setDeleting(false);
    }
  };

  const houseList = houses.data ?? [];

  return (
    <Screen>
      <Stack.Screen options={{ title: t('profile.settings') }} />

      <Section header={t('profile.theme')}>
        <View style={styles.control}>
          <SegmentedControl options={themeOptions} value={mode} onChange={setMode} />
        </View>
      </Section>

      <Section header={t('profile.language')}>
        <View style={styles.control}>
          <SegmentedControl options={localeOptions} value={locale} onChange={changeLocale} />
        </View>
      </Section>

      {houseList.length > 1 ? (
        <Section header={t('profile.switchHouse')}>
          {houseList.map((house) => (
            <ListRow
              key={house.id}
              icon="home"
              title={house.name}
              subtitle={house.address ?? undefined}
              trailing={house.id === activeHouseId ? <Icon name="check" size={18} color={colors.tint} /> : undefined}
              onPress={() => {
                haptics.selection();
                setActiveHouseId(house.id);
              }}
            />
          ))}
        </Section>
      ) : null}

      <Section header={t('account.account')}>
        <ListRow icon="logout" title={t('auth.signOut')} onPress={() => void signOut()} />
        <ListRow icon="trash" title={t('profile.deleteAccount')} destructive onPress={() => setConfirmDelete(true)} />
      </Section>

      <ActionSheet
        visible={confirmDelete && !isPasswordAccount}
        onClose={() => setConfirmDelete(false)}
        title={t('profile.deleteAccount')}
        message={deleteError ?? t('account.deleteAccountWarn')}
        cancelLabel={t('common.cancel')}
        options={[{ label: t('profile.deleteAccount'), destructive: true, onPress: () => void runDelete() }]}
      />

      <BottomSheet
        visible={confirmDelete && isPasswordAccount}
        onClose={() => {
          setConfirmDelete(false);
          setPassword('');
          setDeleteError(null);
        }}
        title={t('profile.deleteAccount')}
      >
        <View style={styles.sheet}>
          <Text variant="footnote" color="secondaryLabel">
            {t('account.deleteAccountWarn')}
          </Text>
          <TextField
            label={t('account.passwordForDelete')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            error={deleteError ?? undefined}
          />
          <Button
            title={t('profile.deleteAccount')}
            destructive
            onPress={() => void runDelete()}
            loading={deleting}
            disabled={password.length === 0}
          />
        </View>
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  control: { padding: spacing.md },
  sheet: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
});
