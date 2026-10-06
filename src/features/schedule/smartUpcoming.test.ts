import { makeBill, makeCategory } from '@/test/fixtures';
import { detectCycle, getSmartUpcoming } from './smartUpcoming';

const cat = (id: string) => makeCategory({ id, name: id });
const series = (id: string, vals: [string, number][]) => vals.map(([m, c]) => makeBill(id, c, null, { periodEndDate: `${m}-28` }));

describe('detectCycle', () => {
  it('finds monthly, even-month and quarterly patterns', () => {
    const months = (ms: string[]) => new Set(ms);
    expect(detectCycle(months(['2025-01', '2025-02', '2025-03', '2025-04', '2025-06']), '2025-01', '2025-06')?.every).toBe(1);
    expect(detectCycle(months(['2025-02', '2025-04', '2025-06', '2025-08']), '2025-02', '2025-08')).toEqual({ every: 2, residue: 1 }); // idx is 0-based: Feb, Apr, Jun…
    expect(detectCycle(months(['2025-01', '2025-04', '2025-07', '2025-10']), '2025-01', '2025-10')).toEqual({ every: 3, residue: 0 });
    expect(detectCycle(months(['2025-01']), '2025-01', '2025-06')).toBeNull();
  });
});

describe('getSmartUpcoming', () => {
  const today = '2026-10-06';
  it('predicts bimonthly gas only on its months, with a seasonal estimate', () => {
    const gas = cat('gas');
    const bills = series('gas', [['2025-04', 4900], ['2025-06', 5600], ['2025-08', 5200], ['2025-10', 5200], ['2025-12', 7300], ['2026-02', 9300], ['2026-04', 7100], ['2026-06', 5500], ['2026-08', 8400]]);
    const up = getSmartUpcoming([gas], bills, today, 1);
    expect(up.map((u) => u.month)).toEqual(['2026-10']); // Nov is an "odd" month: no gas
    expect(up[0].everyMonths).toBe(2);
    expect(up[0].basis).toBe('SEASONAL');
    expect(up[0].estimateCents).toBeGreaterThan(5200); // last Oct x growth
    expect(up[0].lowCents).toBeLessThan(up[0].estimateCents as number);
  });

  it('uses the latest amount for stable series (rent step up)', () => {
    const rent = cat('rent');
    const bills = series('rent', [['2026-05', 96918], ['2026-06', 96918], ['2026-07', 96918], ['2026-08', 96918], ['2026-09', 96918], ['2026-10', 100407]]);
    const up = getSmartUpcoming([rent], bills, today, 1);
    expect(up).toHaveLength(1); // October already billed -> only November
    expect(up[0]).toMatchObject({ month: '2026-11', estimateCents: 100407, basis: 'STABLE' });
  });

  it('skips months already billed and discontinued categories', () => {
    const luz = cat('luz');
    const old = cat('old');
    const bills = [
      ...series('luz', ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'].map((m) => [m, 8000] as [string, number])),
      ...series('old', ['2023-01', '2023-02', '2023-03', '2023-04'].map((m) => [m, 5000] as [string, number])),
    ];
    const up = getSmartUpcoming([luz, old], bills, today, 1);
    expect(up.map((u) => `${u.category.id}:${u.month}`)).toEqual(['luz:2026-11']);
  });

  it('falls back to the category schedule when there is no history', () => {
    const c = makeCategory({ id: 'netflix', name: 'Netflix', intervalUnit: 'WEEK', intervalCount: 4, anchorDate: '2026-10-10', expectedAmountCents: 1500 });
    const up = getSmartUpcoming([c], [], today, 1);
    expect(up[0]).toMatchObject({ basis: 'SCHEDULE', date: '2026-10-10', estimateCents: 1500 });
  });
});
