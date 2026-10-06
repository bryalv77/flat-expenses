import {
  ELECTRICITY,
  GAS,
  NETFLIX,
  RENT,
  makeBill,
  makeCategory,
  makeMember,
} from '@/test/fixtures';
import {
  amortizedMonthlyTotals,
  buildBillsCsv,
  categoryBreakdown,
  categoryStats,
  computeDelta,
  computeSeasonality,
  cyclesOf,
  filterBills,
  lastNMonths,
  linearSlope,
  lookupMonth,
  monthlySeries,
  perPersonTable,
  totalsByMonth,
  whoPays,
} from './calculations';

const gasBills = [
  makeBill('gas', 8000, '2025-03-15'),
  makeBill('gas', 6000, '2025-05-15'),
  makeBill('gas', 10000, '2025-07-15'),
];

describe('totals and series', () => {
  it('groups by effective date (charge, period end, createdAt)', () => {
    const bills = [
      makeBill('a', 100, '2025-01-31'),
      makeBill('a', 200, null, { periodEndDate: '2025-02-10' }),
      makeBill('a', 300, null, { createdAt: '2025-02-20T12:00:00.000Z' }),
    ];
    expect(totalsByMonth(bills)).toEqual({ '2025-01': 100, '2025-02': 500 });
  });

  it('zero-fills the monthly series and stacks by category', () => {
    const bills = [makeBill('rent', 1000, '2025-01-01'), makeBill('gas', 400, '2025-03-15')];
    const rows = monthlySeries(bills, '2025-01', '2025-03');
    expect(rows.map((r) => r.totalCents)).toEqual([1000, 0, 400]);
    expect(rows[2].byCategory).toEqual({ gas: 400 });
    expect(lastNMonths('2025-02', 4)).toEqual(['2024-11', '2024-12', '2025-01', '2025-02']);
  });

  it('handles the leap-day boundary in filters', () => {
    const bills = [makeBill('a', 100, '2024-02-29'), makeBill('a', 100, '2024-03-01')];
    expect(filterBills(bills, '2024-02-01', '2024-02-29')).toHaveLength(1);
    expect(filterBills(bills, '2024-02-01', '2024-03-01', 'other')).toHaveLength(0);
    expect(totalsByMonth(bills)).toEqual({ '2024-02': 100, '2024-03': 100 });
  });

  it('computes deltas and breakdowns', () => {
    expect(computeDelta(1200, 1000)).toEqual({ deltaCents: 200, ratio: 0.2 });
    expect(computeDelta(100, 0).ratio).toBeNull();
    const b = categoryBreakdown([
      makeBill('a', 300, '2025-01-01'),
      makeBill('b', 100, '2025-01-01'),
    ]);
    expect(b.map((x) => [x.categoryId, x.ratio])).toEqual([
      ['a', 0.75],
      ['b', 0.25],
    ]);
  });
});

describe('amortization', () => {
  it('spreads a bi-monthly bill over its two months', () => {
    expect(amortizedMonthlyTotals([gasBills[0]], cyclesOf([GAS]))).toEqual({
      '2025-02': 4000,
      '2025-03': 4000,
    });
  });
});

describe('categoryStats', () => {
  it('computes gas bi-monthly averages (amortized per month)', () => {
    const s = categoryStats(gasBills, GAS);
    expect(s.billCount).toBe(3);
    expect(s.totalCents).toBe(24000);
    expect(s.avgPerBillCents).toBe(8000);
    expect(s.avgPerMonthCents).toBe(4000);
    expect(s.minBillCents).toBe(6000);
    expect(s.maxBillCents).toBe(10000);
    expect(s.series.map((p) => p.totalCents)).toEqual([8000, 0, 6000, 0, 10000]);
    expect(s.amortizedSeries.map((p) => p.cents)).toEqual([4000, 4000, 3000, 3000, 5000, 5000]);
  });

  it('handles Netflix every 4 weeks (monthly equivalent > bill)', () => {
    const s = categoryStats([makeBill('netflix', 1500, '2025-01-03')], NETFLIX);
    expect(s.avgPerBillCents).toBe(1500);
    expect(s.avgPerMonthCents).toBe(1631);
  });

  it('handles rent monthly and empty input', () => {
    const rent = [makeBill('rent', 120000, '2025-01-01'), makeBill('rent', 120000, '2025-02-01')];
    expect(categoryStats(rent, RENT)).toMatchObject({ avgPerMonthCents: 120000, trend: 'FLAT' });
    const empty = categoryStats([], RENT);
    expect(empty).toMatchObject({
      billCount: 0,
      avgPerMonthCents: 0,
      minBillCents: null,
      series: [],
    });
  });

  it('detects an upward trend', () => {
    const bills = [1000, 2000, 3000, 4000].map((c, i) =>
      makeBill('electricity', c, `2025-0${i + 1}-10`),
    );
    const s = categoryStats(bills, ELECTRICITY);
    expect(s.trend).toBe('UP');
    expect(s.trendCentsPerMonth).toBe(1000);
    expect(linearSlope([5, 5, 5])).toBe(0);
  });
});

describe('seasonality', () => {
  const monthly = (year: number, m: number): number =>
    [6, 7, 8, 9].includes(m) ? 15000 : [12, 1, 2].includes(m) ? 12000 : 8000;
  const bills = [2024, 2025].flatMap((y) =>
    Array.from({ length: 12 }, (_, i) =>
      makeBill('electricity', monthly(y, i + 1), `${y}-${String(i + 1).padStart(2, '0')}-10`),
    ),
  );
  const s = computeSeasonality(bills, [ELECTRICITY], 'electricity');

  it('compares summer, winter and the yearly average', () => {
    expect(s.summerAverageCents).toBe(15000);
    expect(s.winterAverageCents).toBe(12000);
    expect(s.yearlyAverageCents).toBe(11333);
    expect(s.summerFactor).toBeCloseTo(1.3235, 3);
    expect(s.winterFactor).toBeCloseTo(1.0588, 3);
  });
  it('exposes month-of-year averages and year-over-year lines', () => {
    expect(s.byMonthOfYear[6]).toEqual({ month: 7, averageCents: 15000, samples: 2 });
    expect(s.yearOverYear.map((y) => y.year)).toEqual([2024, 2025]);
    expect(s.yearOverYear[0].months).toHaveLength(12);
  });
  it('returns empty structure without data', () => {
    const e = computeSeasonality([], [ELECTRICITY]);
    expect(e.yearlyAverageCents).toBeNull();
    expect(e.byMonthOfYear).toHaveLength(12);
  });
});

describe('lookupMonth', () => {
  it('answers "how much on phone in March 2026"', () => {
    const phone = makeCategory({ id: 'phone' });
    const bills = [
      makeBill(phone.id, 2500, '2026-03-05'),
      makeBill(phone.id, 1000, '2026-03-20'),
      makeBill(phone.id, 900, '2026-04-02'),
      makeBill('luz', 7000, '2026-03-11'),
    ];
    const r = lookupMonth(bills, '2026-03', phone.id);
    expect(r).toMatchObject({ totalCents: 3500, billCount: 2 });
    expect(lookupMonth(bills, '2026-03').totalCents).toBe(10500);
  });
});

describe('perPersonTable', () => {
  it('honours members joining mid-year and accumulates', () => {
    const members = [makeMember('a', '2025-01-01'), makeMember('b', '2025-06-15')];
    const bills = [makeBill('x', 3000, '2025-05-10'), makeBill('x', 3000, '2025-06-10')];
    const t = perPersonTable(bills, members, '2025-05', '2025-06');
    expect(t.rows[0].shares).toEqual([{ memberId: 'a', cents: 3000 }]);
    expect(t.rows[1].shares.map((s) => s.cents)).toEqual([1500, 1500]);
    expect(t.cumulativeByMember).toEqual({ a: 4500, b: 1500 });
  });
});

describe('buildBillsCsv', () => {
  it('exports sorted rows with escaping and decimal amounts', () => {
    const bills = [
      makeBill('gas', 8050, '2025-03-15', { notes: 'He said "hi", ok', fileName: 'gas.pdf' }),
      makeBill('rent', 120000, '2025-01-01'),
    ];
    const csv = buildBillsCsv(bills, [GAS, RENT]);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe(
      'date,category,amount_eur,charge_date,period_start,period_end,file_name,notes',
    );
    expect(lines[1]).toBe('2025-01-01,Alquiler,1200.00,2025-01-01,,,,');
    expect(lines[2]).toBe('2025-03-15,Gas,80.50,2025-03-15,,,gas.pdf,"He said ""hi"", ok"');
  });
});

describe('whoPays', () => {
  it('admin covers total minus roommates payments; counts who paid more per month', () => {
    const bills = [makeBill('a', 100000, '2025-01-10'), makeBill('a', 50000, '2025-02-10'), makeBill('a', 60000, '2025-03-10')];
    const payments = [
      { month: '2025-01-01', amountCents: 40000 },
      { month: '2025-01-01', amountCents: 30000 },
      { month: '2025-02-01', amountCents: 10000 },
      { month: '2025-03-01', amountCents: 30000 },
    ];
    const r = whoPays(bills, payments, '2025-01', '2025-04');
    expect(r.rows.map((x) => [x.month, x.totalCents, x.roommatesCents, x.adminCents])).toEqual([
      ['2025-01', 100000, 70000, 30000],
      ['2025-02', 50000, 10000, 40000],
      ['2025-03', 60000, 30000, 30000],
      ['2025-04', 0, 0, 0],
    ]);
    expect(r.totalCents).toBe(210000);
    expect(r.adminCents).toBe(100000);
    expect(r.roommatesCents).toBe(110000);
    expect(r.monthsAdminMore).toBe(1);
    expect(r.monthsRoommatesMore).toBe(1);
    expect(r.averageMonthlyCents).toBe(70000);
  });
});
