import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { ConfirmSheet, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { getLocalDb } from '@/lib/api/local/sql.expo';

import { BackupError, exportBackup, importBackup, wipeAllLocalData } from './backup';
import { appBackupFiles, pickBackup, shareBackup } from './platform';
import { LAST_EXPORT_KEY } from './reminder';

type Pending = null | { kind: 'import'; archive: Uint8Array } | { kind: 'delete' };

/** Handlers for Profile's LocalDataSection. Render `sheet` once next to it: it hosts the destructive confirmations. */
export function useBackupActions(): { onExport: () => void; onImport: () => void; onDeleteAll: () => void; sheet: ReactNode } {
  const { t } = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const [pending, setPending] = useState<Pending>(null);

  const fail = (e: unknown) =>
    toast.error(e instanceof BackupError && e.code === 'newer-version' ? t('backup.newerVersion') : e instanceof BackupError && e.code !== 'too-large' ? t('backup.invalid') : t('backup.failed'));

  const onExport = async () => {
    try {
      await shareBackup(await exportBackup(await getLocalDb(), appBackupFiles));
      await AsyncStorage.setItem(LAST_EXPORT_KEY, new Date().toISOString());
      toast.success(t('backup.exported'));
    } catch (e) {
      fail(e);
    }
  };

  // Pick first so a wrong file never reaches the destructive confirmation.
  const onImport = async () => {
    try {
      const archive = await pickBackup();
      if (archive) setPending({ kind: 'import', archive });
    } catch (e) {
      fail(e);
    }
  };

  const confirm = async () => {
    const p = pending;
    setPending(null);
    try {
      const db = await getLocalDb();
      if (p?.kind === 'import') await importBackup(db, appBackupFiles, p.archive);
      else if (p?.kind === 'delete') await wipeAllLocalData(db, appBackupFiles);
      else return;
      await qc.resetQueries(); // refetch active queries so the gate sees the new (or empty) database
      toast.success(t(p.kind === 'import' ? 'backup.imported' : 'backup.deleted'));
    } catch (e) {
      fail(e);
    }
  };

  const isImport = pending?.kind === 'import';
  return {
    onExport,
    onImport,
    onDeleteAll: () => setPending({ kind: 'delete' }),
    sheet: (
      <ConfirmSheet
        visible={pending !== null}
        title={t(isImport ? 'backup.importConfirm' : 'backup.deleteConfirm')}
        confirmLabel={t(isImport ? 'backup.import' : 'localMode.deleteAll')}
        onConfirm={confirm}
        onClose={() => setPending(null)}
      />
    ),
  };
}
