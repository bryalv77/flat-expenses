import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

import { useBills } from '@/features/bills/hooks';
import { useActiveHouse } from '@/features/houses/hooks';
import { getAppMode } from '@/lib/appMode';
import { addMonthsToKey, monthEnd, monthKey, monthStart, todayISO } from '@/lib/dates';

import { countBillsSince, shouldRemind, snoozeUntil } from './reminder';
import { LAST_EXPORT_KEY } from './useBackupActions';

export const SNOOZE_KEY = 'backup.snoozedUntil';

export function useExportReminder(onExport: () => void | Promise<void>) {
  const { house } = useActiveHouse();
  const month = monthKey(todayISO());
  // Same range as the Home tab so the query cache is shared. shortcut: bills dated outside the last 3 years are not counted.
  const { data: bills = [] } = useBills(house?.id, { from: monthStart(addMonthsToKey(month, -35)), to: monthEnd(month) });
  const [stored, setStored] = useState<{ lastExportAt: string | null; snoozedUntil: number | null } | null>(null);

  const [version, setVersion] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let live = true;
    Promise.all([AsyncStorage.getItem(LAST_EXPORT_KEY), AsyncStorage.getItem(SNOOZE_KEY)])
      .then(([last, snooze]) => ({ lastExportAt: last, snoozedUntil: snooze ? Number(snooze) : null }))
      .catch(() => ({ lastExportAt: null, snoozedUntil: null }))
      .then((v) => { if (live) { setStored(v); setNow(Date.now()); } });
    return () => { live = false; };
  }, [version]);

  const visible =
    stored !== null &&
    shouldRemind({ mode: getAppMode(), ...stored, billsSinceExport: countBillsSince(bills, stored.lastExportAt), now });

  const snooze = async () => {
    const until = snoozeUntil(Date.now());
    try { await AsyncStorage.setItem(SNOOZE_KEY, String(until)); } catch { /* banner just reappears next launch */ }
    setStored((s) => (s ? { ...s, snoozedUntil: until } : s));
  };
  const exportNow = async () => {
    await onExport();
    setVersion((v) => v + 1);
  };
  return { visible, snooze, exportNow };
}
