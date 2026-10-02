import { makeBill, makeMember } from '@/test/fixtures';
import {
  activeMembersInMonth,
  balanceStatus,
  computeBalanceSeries,
  computeMonthBalance,
  computeMonthShares,
  computePaymentStatus,
  contributionForMember,
  getEffectiveDate,
  recommendContribution,
  splitEqual,
} from './index';

describe('getEffectiveDate', () => {
  it('prefers chargeDate, then periodEndDate, then createdAt', () => {
    const base = { chargeDate: null, periodEndDate: null, createdAt: '2025-04-09T23:30:00.000Z' };
    expect(
      getEffectiveDate({ ...base, chargeDate: '2025-03-01', periodEndDate: '2025-03-31' }),
    ).toBe('2025-03-01');
    expect(getEffectiveDate({ ...base, periodEndDate: '2025-03-31' })).toBe('2025-03-31');
    expect(getEffectiveDate(base)).toBe('2025-04-09');
  });
});

describe('splitEqual', () => {
  it('distributes leftover cents to the first members', () => {
    expect(splitEqual(1000, ['a', 'b', 'c'])).toEqual([
      { memberId: 'a', cents: 334 },
      { memberId: 'b', cents: 333 },
      { memberId: 'c', cents: 333 },
    ]);
  });
  it('always sums to the total', () => {
    for (const total of [0, 1, 2, 99, 12345, 100001]) {
      for (const n of [1, 2, 3, 4, 7]) {
        const ids = Array.from({ length: n }, (_, i) => `m${i}`);
        expect(splitEqual(total, ids).reduce((s, x) => s + x.cents, 0)).toBe(total);
      }
    }
  });
  it('handles negatives and no members', () => {
    expect(splitEqual(-1000, ['a', 'b', 'c']).map((s) => s.cents)).toEqual([-334, -333, -333]);
    expect(splitEqual(500, [])).toEqual([]);
  });
});

describe('activeMembersInMonth', () => {
  const a = makeMember('a', '2025-01-01', { role: 'ADMIN' });
  const b = makeMember('b', '2025-06-15');
  const c = makeMember('c', '2025-01-01', { status: 'REMOVED', removedAt: '2025-03-10' });
  const members = [b, c, a];
  const ids = (month: string) => activeMembersInMonth(members, month).map((m) => m.id);

  it('respects joinedAt and removedAt and orders by join date', () => {
    expect(ids('2025-02')).toEqual(['a', 'c']);
    expect(ids('2025-03')).toEqual(['a', 'c']); // removed mid-month still counts for that month
    expect(ids('2025-04')).toEqual(['a']);
    expect(ids('2025-06')).toEqual(['a', 'b']); // joined mid-month counts for that month
    expect(ids('2024-12')).toEqual([]);
  });
});

describe('computeMonthShares (member joining mid-year)', () => {
  const members = [makeMember('a', '2025-01-01'), makeMember('b', '2025-06-15')];
  const bills = [
    makeBill('luz', 3001, '2025-05-10'),
    makeBill('luz', 3001, '2025-06-10'),
    makeBill('gas', 1000, '2025-06-12'),
  ];

  it('gives the whole month to the only active member before the join', () => {
    const may = computeMonthShares(bills, members, '2025-05');
    expect(may.perMember).toEqual([{ memberId: 'a', cents: 3001 }]);
  });
  it('splits with the new member afterwards and per category', () => {
    const june = computeMonthShares(bills, members, '2025-06');
    expect(june.totalCents).toBe(4001);
    expect(june.perMember).toEqual([
      { memberId: 'a', cents: 2001 },
      { memberId: 'b', cents: 2000 },
    ]);
    expect(june.perCategory[0]).toMatchObject({ categoryId: 'luz', totalCents: 3001 });
    expect(june.perCategory[0].perMember.map((s) => s.cents)).toEqual([1501, 1500]);
  });
});

describe('Mode B balance', () => {
  const house = { fixedContributionCents: 30000 };
  const members = [
    makeMember('admin', '2025-01-01', { role: 'ADMIN' }),
    makeMember('r1', '2025-01-01'),
    makeMember('r2', '2025-01-01'),
  ];

  it('classifies surplus, sufficient and insufficient', () => {
    expect(computeMonthBalance(house, members, '2025-02', 55000)).toMatchObject({
      expectedIncomeCents: 60000,
      balanceCents: 5000,
      status: 'SURPLUS',
    });
    expect(computeMonthBalance(house, members, '2025-02', 60000).status).toBe('SUFFICIENT');
    expect(computeMonthBalance(house, members, '2025-02', 70000)).toMatchObject({
      balanceCents: -10000,
      status: 'INSUFFICIENT',
    });
    expect(balanceStatus(0)).toBe('SUFFICIENT');
  });
  it('uses per-member overrides and also exposes the equal-split share', () => {
    const withOverride = [
      members[0],
      members[1],
      { ...members[2], individualContributionCents: 20000 },
    ];
    expect(contributionForMember(house, withOverride[2])).toBe(20000);
    const b = computeMonthBalance(house, withOverride, '2025-02', 60000);
    expect(b.expectedIncomeCents).toBe(50000);
    expect(b.equalShares.map((s) => s.cents)).toEqual([20000, 20000, 20000]);
  });
  it('accumulates the balance across months', () => {
    const series = computeBalanceSeries(house, members, '2025-01', '2025-03', {
      '2025-01': 50000,
      '2025-02': 70000,
    });
    expect(series.map((r) => r.balanceCents)).toEqual([10000, -10000, 60000]);
    expect(series.map((r) => r.cumulativeBalanceCents)).toEqual([10000, 0, 60000]);
  });
});

describe('recommendContribution', () => {
  it('computes break-even and margin per roommate (rounded up)', () => {
    expect(recommendContribution([30000, 60000, 90000], 2, 1000)).toEqual({
      averageMonthlySpendCents: 60000,
      breakEvenCents: 30000,
      withMarginCents: 30500,
      monthsConsidered: 3,
    });
    expect(recommendContribution([100], 3)?.breakEvenCents).toBe(34);
    expect(recommendContribution([], 3)).toBeNull();
    expect(recommendContribution([100], 0)).toBeNull();
  });
});

describe('computePaymentStatus', () => {
  const house = { fixedContributionCents: 30000 };
  const members = [
    makeMember('admin', '2025-01-01', { role: 'ADMIN' }),
    makeMember('r1', '2025-01-01'),
    makeMember('r2', '2025-01-01'),
    makeMember('r3', '2025-01-01'),
  ];
  const payments = [
    { memberId: 'r1', month: '2025-02-01', amountCents: 30000 },
    { memberId: 'r2', month: '2025-02-01', amountCents: 10000 },
    { memberId: 'r3', month: '2025-02-01', amountCents: 35000 },
    { memberId: 'r1', month: '2025-03-01', amountCents: 30000 },
  ];
  it('reports paid, partial and overpaid and totals', () => {
    const s = computePaymentStatus(house, members, payments, '2025-02');
    expect(s.perMember.map((p) => p.state)).toEqual(['PAID', 'PARTIAL', 'OVERPAID']);
    expect(s.totalDueCents).toBe(90000);
    expect(s.totalPaidCents).toBe(75000);
    expect(s.totalPendingCents).toBe(20000);
  });
  it('marks unpaid roommates as pending and ignores other months', () => {
    const s = computePaymentStatus(house, members, payments, '2025-04');
    expect(s.perMember.every((p) => p.state === 'PENDING')).toBe(true);
    expect(s.totalPendingCents).toBe(90000);
  });
});
