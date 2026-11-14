import { DAY_MS, REMIND_AFTER_BILLS, REMIND_AFTER_DAYS, SNOOZE_DAYS, countBillsSince, shouldRemind, snoozeUntil } from './reminder';

const now = new Date('2026-06-01T12:00:00Z').getTime();
const ago = (days: number) => new Date(now - days * DAY_MS).toISOString();
const base = { mode: 'local' as const, lastExportAt: ago(1), billsSinceExport: 0, snoozedUntil: null, now };

describe('shouldRemind', () => {
  it('never in cloud mode', () => {
    expect(shouldRemind({ ...base, mode: 'cloud', lastExportAt: null, billsSinceExport: 99 })).toBe(false);
    expect(shouldRemind({ ...base, mode: 'cloud', lastExportAt: ago(400) })).toBe(false);
  });
  it('never exported: needs at least 1 bill', () => {
    expect(shouldRemind({ ...base, lastExportAt: null, billsSinceExport: 0 })).toBe(false);
    expect(shouldRemind({ ...base, lastExportAt: null, billsSinceExport: 1 })).toBe(true);
  });
  it('day threshold edge', () => {
    expect(shouldRemind({ ...base, lastExportAt: ago(REMIND_AFTER_DAYS - 0.01) })).toBe(false);
    expect(shouldRemind({ ...base, lastExportAt: ago(REMIND_AFTER_DAYS) })).toBe(true);
  });
  it('bill threshold edge', () => {
    expect(shouldRemind({ ...base, billsSinceExport: REMIND_AFTER_BILLS - 1 })).toBe(false);
    expect(shouldRemind({ ...base, billsSinceExport: REMIND_AFTER_BILLS })).toBe(true);
  });
  it('snooze edge: active while snoozedUntil > now', () => {
    const due = { ...base, lastExportAt: ago(60) };
    expect(shouldRemind({ ...due, snoozedUntil: now + 1 })).toBe(false);
    expect(shouldRemind({ ...due, snoozedUntil: now })).toBe(true);
  });
  it('a fresh export resets both counters', () => {
    expect(shouldRemind({ ...base, lastExportAt: ago(60), billsSinceExport: 50 })).toBe(true);
    expect(shouldRemind({ ...base, lastExportAt: new Date(now).toISOString(), billsSinceExport: 0 })).toBe(false);
  });
});

describe('helpers', () => {
  it('snoozeUntil is now + 7 days', () => expect(snoozeUntil(now)).toBe(now + SNOOZE_DAYS * DAY_MS));
  it('countBillsSince counts createdAt strictly after lastExportAt; all when never exported', () => {
    const bills = [{ createdAt: ago(5) }, { createdAt: ago(1) }, { createdAt: ago(2) }];
    expect(countBillsSince(bills, null)).toBe(3);
    expect(countBillsSince(bills, ago(2))).toBe(1);
    expect(countBillsSince(bills, ago(0))).toBe(0);
  });
});
