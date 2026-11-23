import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button, ConfirmSheet, Screen, Text } from '@/components/ui';
import { enterLocalMode } from '@/features/auth/appModeSwitch';
import { useAuth } from '@/features/auth';
import { wipeAllLocalData } from '@/features/backup/backup';
import { appBackupFiles } from '@/features/backup/platform';
import { clearPendingSync } from '@/features/sync/pending';
import { computeSyncDecision, readLocalHouses, uploadLocalToCloud, type LocalHouseData, type SyncScenario } from '@/features/sync/sync';
import { useT } from '@/i18n';
import { localApi } from '@/lib/api/local';
import { getLocalDb } from '@/lib/api/local/sql.expo';
import { api } from '@/lib/db';
import { localFileStore } from '@/lib/fileStore.local';
import { qk } from '@/lib/queryKeys';
import { uploadFile } from '@/lib/storage';
import { spacing } from '@/theme';

interface Snapshot {
  cloudIds: Set<string>;
  localHouses: LocalHouseData[];
  scenario: SyncScenario;
}

/**
 * Shown once after a cloud login that came from local mode. Resolves what to do with the on-device
 * data: nothing (no local data), upload it (cloud empty), or let the user choose (both have data).
 */
export default function SyncScreen() {
  const { t } = useT();
  const router = useRouter();
  const qc = useQueryClient();
  const { authUser } = useAuth();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const lastModeRef = useRef<'upload' | 'discard'>('upload');

  const snapshot = useQuery<Snapshot>({
    queryKey: ['sync', 'snapshot'],
    queryFn: async () => {
      const [cloudHouses, localHouses] = await Promise.all([api.listMyHouses(), readLocalHouses(localApi)]);
      return { cloudIds: new Set(cloudHouses.map((h) => h.id)), localHouses, scenario: computeSyncDecision(localHouses.length, cloudHouses.length) };
    },
  });

  const finish = useCallback(() => {
    void clearPendingSync().finally(() => router.replace('/(app)/(tabs)' as Href));
  }, [router]);

  const resolve = useMutation({
    mutationFn: async (mode: 'upload' | 'discard') => {
      lastModeRef.current = mode;
      const s = snapshot.data;
      const uid = authUser?.uid;
      if (!s || !uid) throw new Error('not ready');
      if (mode === 'upload') {
        await uploadLocalToCloud(
          {
            cloud: api,
            uid,
            localFileUrl: (path) => localFileStore.getUrl(path),
            uploadFile: (path, file) => uploadFile(path, file),
          },
          s.localHouses,
          s.cloudIds,
        );
      }
      await wipeAllLocalData(await getLocalDb(), appBackupFiles);
      await qc.invalidateQueries({ queryKey: qk.houses });
    },
    onSuccess: finish,
  });

  // Auto-resolve the two non-interactive outcomes once the snapshot is known.
  const autoRan = useRef(false);
  useEffect(() => {
    if (!snapshot.data || autoRan.current) return;
    autoRan.current = true;
    const s = snapshot.data.scenario;
    if (s.kind === 'nothing') finish();
    else if (s.kind === 'upload') resolve.mutate('upload');
  }, [snapshot.data, finish, resolve]);

  const loading = snapshot.isLoading || resolve.isPending;
  const failed = snapshot.isError || resolve.isError;

  return (
    <Screen scroll={false}>
      <View style={styles.body}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator />
            <Text variant="body" color="secondaryLabel">
              {t('sync.uploading')}
            </Text>
          </View>
        ) : null}

        {!loading && failed ? (
          <View style={styles.center}>
            <Text variant="body" color="red">
              {t('sync.failed')}
            </Text>
            <View style={styles.actions}>
              <Button
                title={t('common.retry')}
                onPress={() => (snapshot.isError ? snapshot.refetch() : resolve.mutate(lastModeRef.current))}
              />
              <Button title={t('sync.backToLocal')} variant="plain" onPress={() => void enterLocalMode()} />
            </View>
          </View>
        ) : null}

        {!loading && !failed && snapshot.data?.scenario.kind === 'choose' ? (
          <View style={styles.center}>
            <Text variant="title2" style={styles.centerText}>
              {t('sync.chooseTitle')}
            </Text>
            <Text variant="body" color="secondaryLabel" style={styles.centerText}>
              {t('sync.chooseBody')}
            </Text>
            <View style={styles.actions}>
              <Button title={t('sync.upload')} onPress={() => resolve.mutate('upload')} />
              <Button title={t('sync.discard')} variant="tinted" onPress={() => setConfirmDiscard(true)} />
              <Button title={t('sync.backToLocal')} variant="plain" onPress={() => void enterLocalMode()} />
            </View>
          </View>
        ) : null}
      </View>
      <ConfirmSheet
        visible={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        title={t('sync.discardConfirmTitle')}
        message={t('sync.discardConfirmBody')}
        confirmLabel={t('sync.discard')}
        onConfirm={() => void resolve.mutate('discard')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  center: { alignItems: 'center', gap: spacing.md },
  centerText: { textAlign: 'center' },
  actions: { gap: spacing.sm, alignSelf: 'stretch', marginTop: spacing.lg },
});
