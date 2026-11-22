import { DAY_MS } from '@/lib/dates';
import type { AppMode } from '@/lib/appMode';

export const LAST_EXPORT_KEY = 'backup.lastExportAt';
export const SNOOZE_KEY = 'backup.snoozedUntil';
export const REMIND_AFTER_DAYS = 30;
export const REMIND_AFTER_BILLS = 20;
export const SNOOZE_DAYS = 7;

export function shouldRemind(a: { mode: AppMode; lastExportAt: string | null; billsSinceExport: number; snoozedUntil: number | null; now: number }): boolean {
  if (a.mode !== 'local') return false;
  if (a.snoozedUntil !== null && a.snoozedUntil > a.now) return false;
  if (!a.lastExportAt) return a.billsSinceExport >= 1;
  const days = (a.now - new Date(a.lastExportAt).getTime()) / DAY_MS;
  return days >= REMIND_AFTER_DAYS || a.billsSinceExport >= REMIND_AFTER_BILLS;
}

export const snoozeUntil = (now: number) => now + SNOOZE_DAYS * DAY_MS;

export function countBillsSince(bills: { createdAt: string }[], lastExportAt: string | null): number {
  if (!lastExportAt) return bills.length;
  const t = new Date(lastExportAt).getTime();
  return bills.filter((b) => new Date(b.createdAt).getTime() > t).length;
}
