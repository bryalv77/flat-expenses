import * as Clipboard from 'expo-clipboard';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Screen, Text, TextField, useToast } from '@/components/ui';
import { useRedeemInvite } from '@/features/members/hooks';
import { formatInviteCode, isValidInviteCode, normalizeInviteCode } from '@/features/members/inviteCode';
import { useT } from '@/i18n';
import { haptics } from '@/lib/haptics';
import { spacing } from '@/theme';

export default function JoinHouseScreen() {
  const { t } = useT();
  const router = useRouter();
  const toast = useToast();
  const redeem = useRedeemInvite();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const setFormatted = (raw: string) => {
    setError(null);
    setCode(formatInviteCode(normalizeInviteCode(raw)));
  };

  const paste = async () => {
    const text = await Clipboard.getStringAsync();
    if (text) setFormatted(text);
  };

  const submit = async () => {
    const normalized = normalizeInviteCode(code);
    if (!isValidInviteCode(normalized)) {
      setError(t('onboarding.invalidCode'));
      haptics.error();
      return;
    }
    try {
      const houseId = await redeem.mutateAsync(normalized);
      if (!houseId) throw new Error('not joined');
      haptics.success();
      router.replace('/(app)/(tabs)' as Href);
    } catch {
      haptics.error();
      setError(t('onboarding.invalidCode'));
      toast.error(t('onboarding.invalidCode'));
    }
  };

  return (
    <Screen>
      <View style={styles.form}>
        <Text variant="largeTitle">{t('onboarding.joinHouse')}</Text>
        <Text variant="body" color="secondaryLabel">
          {t('account.joinHint')}
        </Text>
        <TextField
          label={t('onboarding.inviteCode')}
          value={code}
          onChangeText={setFormatted}
          error={error ?? undefined}
          hint={t('account.codeFormatHint')}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={9}
          onSubmitEditing={submit}
        />
        <Button title={t('onboarding.paste')} icon="copy" variant="tinted" onPress={paste} />
        <Button title={t('onboarding.join')} onPress={submit} loading={redeem.isPending} disabled={!code} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.sm, paddingHorizontal: spacing.lg },
});
