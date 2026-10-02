import { ELECTRICITY, GAS, NETFLIX, RENT, makeBill, makeMember } from '@/test/fixtures';
import { projectMonth, projectionConfidence, weightedRecentAverage } from './projection';

const house = { fixedContributionCents: 50000 };
const members = [
  makeMember('a', '2024-01-01', { role: 'ADMIN' }),
  makeMember('b', '2024-01-01'),
  makeMember('c', '2024-01-01'),
];

describe('projectMonth', () => {
  it('projects FIXED categories from the schedule with no data (low confidence)', () => {
    const p = projectMonth({
      targetMonth: '2025-04',
      categories: [RENT, NETFLIX],
      bills: [],
      members,
      house,
    });
    expect(p.totalCents).toBe(121500); // rent 1x + Netflix 04-25 1x
    expect(p.perCategory.every((c) => c.basis === 'SCHEDULE')).toBe(true);
    expect(p.lowCents).toBe(p.highCents);
    expect(p.confidence).toBe('LOW');
    expect(p.monthsOfData).toBe(0);
  });

  it('computes per-person share (mode A) and balance vs contributions (mode B)', () => {
    const p = projectMonth({
      targetMonth: '2025-04',
      categories: [RENT, NETFLIX],
      bills: [],
      members,
      house,
    });
    expect(p.perPerson.map((s) => s.cents)).toEqual([40500, 40500, 40500]);
    expect(p.balance.expectedIncomeCents).toBe(100000);
    expect(p.balance.balanceCents).toBe(-21500);
    expect(p.balance.status).toBe('INSUFFICIENT');
  });

  it('uses the same month last year for VARIABLE categories, with a range', () => {
    const bills = [
      makeBill('gas', 9000, '2025-01-15'),
      makeBill('gas', 8000, '2025-03-15'),
      makeBill('gas', 6000, '2025-05-15'),
      makeBill('gas', 5000, '2025-07-15'),
      makeBill('gas', 5500, '2025-09-15'),
      makeBill('gas', 8500, '2025-11-15'),
    ];
    const p = projectMonth({ targetMonth: '2026-03', categories: [GAS], bills, members, house });
    expect(p.perCategory[0]).toMatchObject({
      basis: 'LAST_YEAR',
      estimateCents: 8000,
      occurrences: 1,
    });
    expect(p.lowCents).toBeLessThan(8000);
    expect(p.highCents).toBeGreaterThan(8000);
    expect(p.confidence).toBe('MEDIUM'); // Jan..Nov = 11 months

    // Off-cycle month for a bi-monthly category: nothing scheduled.
    const off = projectMonth({ targetMonth: '2026-02', categories: [GAS], bills, members, house });
    expect(off.totalCents).toBe(0);
    expect(off.perCategory[0].basis).toBe('NONE');
  });

  it('falls back to a recency-weighted trailing average', () => {
    const bills = [
      makeBill('electricity', 10000, '2025-10-05'),
      makeBill('electricity', 12000, '2025-11-05'),
      makeBill('electricity', 14000, '2025-12-05'),
    ];
    const p = projectMonth({
      targetMonth: '2026-02',
      categories: [ELECTRICITY],
      bills,
      members,
      house,
    });
    expect(p.perCategory[0]).toMatchObject({ basis: 'TRAILING_AVERAGE', estimateCents: 12667 });
    expect(p.confidence).toBe('LOW');
    expect(weightedRecentAverage([10000, 12000, 14000])).toBeCloseTo(12666.67, 1);
  });

  it('applies a seasonal factor once there is a year of data', () => {
    const level = (m: number): number =>
      [6, 7, 8, 9].includes(m) ? 15000 : [12, 1, 2].includes(m) ? 12000 : 8000;
    const bills = [2024, 2025].flatMap((y) =>
      Array.from({ length: 12 }, (_, i) =>
        makeBill('electricity', level(i + 1), `${y}-${String(i + 1).padStart(2, '0')}-10`),
      ),
    );
    // 2027-07: no 2026-07 bill, so the trailing average (Jul-Dec 2025, 11 143) is seasonally adjusted up.
    const p = projectMonth({
      targetMonth: '2027-07',
      categories: [ELECTRICITY],
      bills,
      members,
      house,
    });
    const c = p.perCategory[0];
    expect(c.basis).toBe('TRAILING_AVERAGE');
    expect(c.estimateCents).toBeGreaterThan(12500);
    expect(c.estimateCents).toBeLessThan(15000);
    expect(p.confidence).toBe('HIGH');
  });

  it('ignores inactive categories and reports confidence levels', () => {
    const p = projectMonth({
      targetMonth: '2025-04',
      categories: [{ ...RENT, isActive: false }],
      bills: [],
      members,
      house,
    });
    expect(p.perCategory).toHaveLength(0);
    expect([projectionConfidence(3), projectionConfidence(8), projectionConfidence(14)]).toEqual([
      'LOW',
      'MEDIUM',
      'HIGH',
    ]);
  });
});
