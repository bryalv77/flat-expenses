import { countBillsSince, shouldRemind, snoozeUntil } from './reminder';

const now = new Date('2026-06-01T12:00:00Z').getTime();
const DAY = 86_400_000;
const ago = (days: number) => new Date(now - days * DAY).toISOString();
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
    expect(shouldRemind({ ...base, lastExportAt: ago(29.99) })).toBe(false);
    expect(shouldRemind({ ...base, lastExportAt: ago(30) })).toBe(true);
  });
  it('bill threshold edge', () => {
    expect(shouldRemind({ ...base, billsSinceExport: 19 })).toBe(false);
    expect(shouldRemind({ ...base, billsSinceExport: 20 })).toBe(true);
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
  it('snoozeUntil is now + 7 days', () => expect(snoozeUntil(now)).toBe(now + 7 * DAY));
  it('countBillsSince counts createdAt strictly after lastExportAt; all when never exported', () => {
    const bills = [{ createdAt: ago(5) }, { createdAt: ago(1) }, { createdAt: ago(2) }];
    expect(countBillsSince(bills, null)).toBe(3);
    expect(countBillsSince(bills, ago(2))).toBe(1);
    expect(countBillsSince(bills, ago(0))).toBe(0);
  });
});
