import { ELECTRICITY, GAS, NETFLIX, RENT, makeCategory } from '@/test/fixtures';
import {
  describeSchedule,
  getOccurrences,
  getUpcomingCharges,
} from './occurrences';

const plain = (s: string) => s.replace(/[  ]/g, ' ');

describe('getOccurrences', () => {
  it('handles Netflix every 4 weeks', () => {
    expect(getOccurrences(NETFLIX, '2025-01-01', '2025-03-31')).toEqual([
      '2025-01-03',
      '2025-01-31',
      '2025-02-28',
      '2025-03-28',
    ]);
  });

  it('handles rent monthly', () => {
    expect(getOccurrences(RENT, '2025-02-01', '2025-04-30')).toEqual([
      '2025-02-01',
      '2025-03-01',
      '2025-04-01',
    ]);
  });

  it('handles gas every 2 months', () => {
    expect(getOccurrences(GAS, '2025-01-01', '2025-12-31')).toEqual([
      '2025-01-15',
      '2025-03-15',
      '2025-05-15',
      '2025-07-15',
      '2025-09-15',
      '2025-11-15',
    ]);
  });

  it('clamps month ends relative to the anchor without drifting', () => {
    const c = makeCategory({ id: 'x', anchorDate: '2025-01-31' });
    expect(getOccurrences(c, '2025-01-01', '2025-05-31')).toEqual([
      '2025-01-31',
      '2025-02-28',
      '2025-03-31',
      '2025-04-30',
      '2025-05-31',
    ]);
  });

  it('handles leap years for months and years', () => {
    const monthly = makeCategory({ id: 'm', anchorDate: '2024-01-31' });
    expect(getOccurrences(monthly, '2024-02-01', '2024-03-31')).toEqual([
      '2024-02-29',
      '2024-03-31',
    ]);
    const yearly = makeCategory({ id: 'y', intervalUnit: 'YEAR', anchorDate: '2024-02-29' });
    expect(getOccurrences(yearly, '2024-01-01', '2028-12-31')).toEqual([
      '2024-02-29',
      '2025-02-28',
      '2026-02-28',
      '2027-02-28',
      '2028-02-29',
    ]);
  });

  it('handles every N days across month boundaries', () => {
    const c = makeCategory({
      id: 'd',
      intervalUnit: 'DAY',
      intervalCount: 10,
      anchorDate: '2026-02-25',
    });
    expect(getOccurrences(c, '2026-02-01', '2026-03-20')).toEqual([
      '2026-02-25',
      '2026-03-07',
      '2026-03-17',
    ]);
  });

  it('returns nothing before the anchor or for inverted ranges', () => {
    expect(getOccurrences(GAS, '2024-01-01', '2024-12-31')).toEqual([]);
    expect(getOccurrences(GAS, '2025-12-31', '2025-01-01')).toEqual([]);
  });
});

describe('getUpcomingCharges', () => {
  it('lists active categories sorted by date and skips inactive ones', () => {
    const inactive = makeCategory({ id: 'off', isActive: false, anchorDate: '2025-03-05' });
    const out = getUpcomingCharges([RENT, NETFLIX, inactive], '2025-03-01', 30);
    expect(out.map((u) => [u.category.id, u.date])).toEqual([
      ['rent', '2025-03-01'],
      ['netflix', '2025-03-28'],
    ]);
    expect(out[1].expectedAmountCents).toBe(1500);
  });
});

describe('describeSchedule', () => {
  it('describes fixed and variable schedules', () => {
    expect(plain(describeSchedule(NETFLIX, 'es').full)).toBe('Cada 4 semanas · 15,00 €');
    expect(describeSchedule(GAS, 'es').full).toBe('Cada 2 meses · variable');
    expect(describeSchedule(RENT, 'es').interval).toBe('Cada mes');
    expect(describeSchedule(NETFLIX, 'en').interval).toBe('Every 4 weeks');
    expect(describeSchedule(ELECTRICITY, 'es').amount).toBe('variable');
    expect(plain(describeSchedule({ ...GAS, expectedAmountCents: 4000 }, 'es').amount)).toBe(
      '~40,00 €',
    );
  });
});
