import type { Bill, ExpenseCategory, HouseMember } from '@/types/domain';
import { addMonthsToKey, monthOfYear, monthRange, parseISODate } from '@/lib/dates';
import { getEffectiveDate, getEffectiveMonth } from '@/features/finance/effectiveDate';
import { activeMembersInMonth, type MemberLike } from '@/features/finance/members';
import { splitEqual, type Share } from '@/features/finance/split';
import { cycleLengthInMonths } from '@/features/schedule/occurrences';

/** Minimum bill shape needed by the aggregations. */
export type BillCore = Pick<
  Bill,
  'categoryId' | 'amountCents' | 'chargeDate' | 'periodEndDate' | 'createdAt'
>;

type CycleFields = Pick<ExpenseCategory, 'intervalUnit' | 'intervalCount'>;

export const SUMMER_MONTHS = [6, 7, 8, 9] as const;
export const WINTER_MONTHS = [12, 1, 2] as const;

// ---------------------------------------------------------------- filtering & totals

/** Bills whose effective date is within [from, to] (inclusive), optionally for one category. */
export function filterBills<T extends BillCore>(
  bills: T[],
  from: string,
  to: string,
  categoryId?: string | null,
): T[] {
  return bills.filter((b) => {
    const d = getEffectiveDate(b);
    return d >= from && d <= to && (!categoryId || b.categoryId === categoryId);
  });
}

export function sumCents(bills: Pick<BillCore, 'amountCents'>[]): number {
  return bills.reduce((s, b) => s + b.amountCents, 0);
}

/** `YYYY-MM` -> total cents (only months with bills). */
export function totalsByMonth(bills: BillCore[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of bills) {
    const m = getEffectiveMonth(b);
    out[m] = (out[m] ?? 0) + b.amountCents;
  }
  return out;
}

/** The `n` month keys ending at `endMonth` (inclusive), oldest first. */
export function lastNMonths(endMonth: string, n: number): string[] {
  return monthRange(addMonthsToKey(endMonth, -(n - 1)), endMonth);
}

export interface MonthlyRow {
  month: string;
  totalCents: number;
  /** Stacked-bar data: category id -> cents. */
  byCategory: Record<string, number>;
}

/** Zero-filled monthly series (e.g. last 12 months) with the per-category stack. */
export function monthlySeries(bills: BillCore[], fromMonth: string, toMonth: string): MonthlyRow[] {
  const rows = new Map<string, MonthlyRow>(
    monthRange(fromMonth, toMonth).map((month) => [
      month,
      { month, totalCents: 0, byCategory: {} },
    ]),
  );
  for (const b of bills) {
    const row = rows.get(getEffectiveMonth(b));
    if (!row) continue;
    row.totalCents += b.amountCents;
    row.byCategory[b.categoryId] = (row.byCategory[b.categoryId] ?? 0) + b.amountCents;
  }
  return [...rows.values()];
}

export interface CategoryBreakdownItem {
  categoryId: string;
  totalCents: number;
  ratio: number;
}

/** Category breakdown of a set of bills, largest first (for donut charts). */
export function categoryBreakdown(bills: BillCore[]): CategoryBreakdownItem[] {
  const map = new Map<string, number>();
  for (const b of bills) map.set(b.categoryId, (map.get(b.categoryId) ?? 0) + b.amountCents);
  const total = sumCents(bills);
  return [...map.entries()]
    .map(([categoryId, totalCents]) => ({
      categoryId,
      totalCents,
      ratio: total ? totalCents / total : 0,
    }))
    .sort((a, b) => b.totalCents - a.totalCents);
}

export interface Delta {
  deltaCents: number;
  /** null when the previous value is 0 (undefined ratio). */
  ratio: number | null;
}

export function computeDelta(currentCents: number, previousCents: number): Delta {
  return {
    deltaCents: currentCents - previousCents,
    ratio: previousCents === 0 ? null : (currentCents - previousCents) / previousCents,
  };
}

// ---------------------------------------------------------------- amortization

/**
 * Spreads each bill evenly over the months its billing cycle covers, ending at the bill's effective
 * month (a bi-monthly 80 € gas bill in March -> 40 € in Feb and 40 € in Mar). Returns `YYYY-MM` -> cents.
 * `cycles` maps category id -> cycle; unknown categories are treated as monthly.
 */
export function amortizedMonthlyTotals(
  bills: BillCore[],
  cycles: Record<string, CycleFields | undefined>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of bills) {
    const cycle = cycles[b.categoryId];
    const spread = cycle ? Math.max(1, Math.round(cycleLengthInMonths(cycle))) : 1;
    const end = getEffectiveMonth(b);
    const parts = splitEqual(
      b.amountCents,
      Array.from({ length: spread }, (_, i) => String(i)),
    );
    parts.forEach((p, i) => {
      const m = addMonthsToKey(end, -i);
      out[m] = (out[m] ?? 0) + p.cents;
    });
  }
  return out;
}

export function cyclesOf(categories: ExpenseCategory[]): Record<string, CycleFields> {
  return Object.fromEntries(categories.map((c) => [c.id, c]));
}

// ---------------------------------------------------------------- per category

export interface CategoryStats {
  billCount: number;
  totalCents: number;
  avgPerBillCents: number;
  /** Amortized: total / (months covered by the bills' cycles). Bi-monthly 80 € x3 -> 40 €. */
  avgPerMonthCents: number;
  minBillCents: number | null;
  maxBillCents: number | null;
  /** Actual billed totals per effective month (zero-filled between first and last bill). */
  series: { month: string; totalCents: number; billCount: number }[];
  /** Amortized monthly series between first and last bill month. */
  amortizedSeries: { month: string; cents: number }[];
  /** Least-squares slope of the amortized series, cents per month. */
  trendCentsPerMonth: number;
  trend: 'UP' | 'DOWN' | 'FLAT';
}

/** Least-squares slope of y over x = 0..n-1. */
export function linearSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  values.forEach((y, x) => {
    num += (x - xMean) * (y - yMean);
    den += (x - xMean) ** 2;
  });
  return den === 0 ? 0 : num / den;
}

export function categoryStats(
  bills: BillCore[],
  category: CycleFields & Pick<ExpenseCategory, 'id'>,
): CategoryStats {
  const own = bills.filter((b) => b.categoryId === category.id);
  const months = own.map(getEffectiveMonth).sort();
  const totalCents = sumCents(own);
  const billCount = own.length;
  const cycleMonths = cycleLengthInMonths(category);

  let series: CategoryStats['series'] = [];
  let amortizedSeries: CategoryStats['amortizedSeries'] = [];
  if (own.length > 0) {
    const first = months[0];
    const last = months[months.length - 1];
    const totals = totalsByMonth(own);
    const counts: Record<string, number> = {};
    for (const m of months) counts[m] = (counts[m] ?? 0) + 1;
    series = monthRange(first, last).map((month) => ({
      month,
      totalCents: totals[month] ?? 0,
      billCount: counts[month] ?? 0,
    }));
    const amortized = amortizedMonthlyTotals(own, { [category.id]: category });
    const aFirst = Object.keys(amortized).sort()[0];
    amortizedSeries = monthRange(aFirst, last).map((month) => ({
      month,
      cents: amortized[month] ?? 0,
    }));
  }

  const slope = linearSlope(amortizedSeries.map((s) => s.cents));
  const mean = amortizedSeries.length
    ? amortizedSeries.reduce((s, p) => s + p.cents, 0) / amortizedSeries.length
    : 0;
  // Treat |total drift over the window| < 5% of the mean as flat.
  const drift = Math.abs(slope) * Math.max(1, amortizedSeries.length - 1);
  const trend = mean === 0 || drift < mean * 0.05 ? 'FLAT' : slope > 0 ? 'UP' : 'DOWN';

  return {
    billCount,
    totalCents,
    avgPerBillCents: billCount ? Math.round(totalCents / billCount) : 0,
    avgPerMonthCents: billCount ? Math.round(totalCents / (billCount * cycleMonths)) : 0,
    minBillCents: billCount ? Math.min(...own.map((b) => b.amountCents)) : null,
    maxBillCents: billCount ? Math.max(...own.map((b) => b.amountCents)) : null,
    series,
    amortizedSeries,
    trendCentsPerMonth: Math.round(slope),
    trend,
  };
}

// ---------------------------------------------------------------- seasonality

export interface Seasonality {
  /** Index 0..11 = January..December. `averageCents` is null with no samples. */
  byMonthOfYear: { month: number; averageCents: number | null; samples: number }[];
  yearlyAverageCents: number | null;
  summerAverageCents: number | null;
  winterAverageCents: number | null;
  /** summer / yearly average (e.g. 1.35 = +35 %), null if undefined. */
  summerFactor: number | null;
  winterFactor: number | null;
  /** One entry per calendar year: 12 amortized monthly values (null = outside data range). */
  yearOverYear: { year: number; months: (number | null)[] }[];
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
}

/**
 * Seasonality of amortized monthly cost over the data range (first to last bill month).
 * Pass `categoryId` to restrict to one category; otherwise all bills are combined.
 */
export function computeSeasonality(
  bills: BillCore[],
  categories: ExpenseCategory[],
  categoryId?: string | null,
): Seasonality {
  const scoped = categoryId ? bills.filter((b) => b.categoryId === categoryId) : bills;
  const empty: Seasonality = {
    byMonthOfYear: Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      averageCents: null,
      samples: 0,
    })),
    yearlyAverageCents: null,
    summerAverageCents: null,
    winterAverageCents: null,
    summerFactor: null,
    winterFactor: null,
    yearOverYear: [],
  };
  if (scoped.length === 0) return empty;

  const amortized = amortizedMonthlyTotals(scoped, cyclesOf(categories));
  const keys = Object.keys(amortized).sort();
  const range = monthRange(keys[0], keys[keys.length - 1]);
  const values = range.map((m) => ({ month: m, cents: amortized[m] ?? 0 }));

  const perMoy: number[][] = Array.from({ length: 12 }, () => []);
  for (const v of values) perMoy[monthOfYear(`${v.month}-01`) - 1].push(v.cents);
  const byMonthOfYear = perMoy.map((arr, i) => {
    const avg = mean(arr);
    return {
      month: i + 1,
      averageCents: avg === null ? null : Math.round(avg),
      samples: arr.length,
    };
  });

  const avgOf = (moys: readonly number[]): number | null => {
    const m = mean(moys.flatMap((moy) => perMoy[moy - 1]));
    return m === null ? null : Math.round(m);
  };
  const yearly = mean(values.map((v) => v.cents));
  const summer = avgOf(SUMMER_MONTHS);
  const winter = avgOf(WINTER_MONTHS);

  const years = new Map<number, (number | null)[]>();
  for (const v of values) {
    const { y, m } = parseISODate(`${v.month}-01`);
    if (!years.has(y)) years.set(y, Array<number | null>(12).fill(null));
    years.get(y)![m - 1] = v.cents;
  }

  return {
    byMonthOfYear,
    yearlyAverageCents: yearly === null ? null : Math.round(yearly),
    summerAverageCents: summer,
    winterAverageCents: winter,
    summerFactor: yearly && summer !== null ? summer / yearly : null,
    winterFactor: yearly && winter !== null ? winter / yearly : null,
    yearOverYear: [...years.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([year, months]) => ({ year, months })),
  };
}

// ---------------------------------------------------------------- lookup

export interface MonthLookup<T extends BillCore> {
  month: string;
  categoryId: string | null;
  totalCents: number;
  billCount: number;
  bills: T[];
}

/** "How much did we spend on phone in March 2026?" */
export function lookupMonth<T extends BillCore>(
  bills: T[],
  month: string,
  categoryId?: string | null,
): MonthLookup<T> {
  const matching = bills
    .filter((b) => getEffectiveMonth(b) === month && (!categoryId || b.categoryId === categoryId))
    .sort((a, b) => getEffectiveDate(a).localeCompare(getEffectiveDate(b)));
  return {
    month,
    categoryId: categoryId ?? null,
    totalCents: sumCents(matching),
    billCount: matching.length,
    bills: matching,
  };
}

// ---------------------------------------------------------------- per person (Mode A)

export interface PerPersonRow {
  month: string;
  totalCents: number;
  shares: Share[];
}

export interface PerPersonTable {
  rows: PerPersonRow[];
  /** Cumulative owed per member id across the range. */
  cumulativeByMember: Record<string, number>;
}

/** Equal-split table per month, honouring each member's active period. */
export function perPersonTable(
  bills: BillCore[],
  members: MemberLike[],
  fromMonth: string,
  toMonth: string,
): PerPersonTable {
  const totals = totalsByMonth(bills);
  const cumulativeByMember: Record<string, number> = {};
  const rows = monthRange(fromMonth, toMonth).map((month) => {
    const ids = activeMembersInMonth(members, month).map((m) => m.id);
    const totalCents = totals[month] ?? 0;
    const shares = splitEqual(totalCents, ids);
    for (const s of shares)
      cumulativeByMember[s.memberId] = (cumulativeByMember[s.memberId] ?? 0) + s.cents;
    return { month, totalCents, shares };
  });
  return { rows, cumulativeByMember };
}

// ---------------------------------------------------------------- CSV export

function csvCell(value: string | number | null | undefined, delimiter: string): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /["\r\n]/.test(s) || s.includes(delimiter) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Decimal string with a dot, e.g. 120050 -> `1200.50` (locale-neutral for spreadsheets). */
export function centsToPlainDecimal(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** CSV of bills sorted by effective date. Excludes the BOM; prepend `﻿` for Excel if desired. */
export function buildBillsCsv(
  bills: Bill[],
  categories: Pick<ExpenseCategory, 'id' | 'name'>[],
  options: { delimiter?: string } = {},
): string {
  const delimiter = options.delimiter ?? ',';
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const header = [
    'date',
    'category',
    'amount_eur',
    'charge_date',
    'period_start',
    'period_end',
    'file_name',
    'notes',
  ];
  const lines = [header.join(delimiter)];
  const sorted = [...bills].sort((a, b) => getEffectiveDate(a).localeCompare(getEffectiveDate(b)));
  for (const b of sorted) {
    lines.push(
      [
        getEffectiveDate(b),
        names.get(b.categoryId) ?? b.categoryId,
        centsToPlainDecimal(b.amountCents),
        b.chargeDate,
        b.periodStartDate,
        b.periodEndDate,
        b.fileName,
        b.notes,
      ]
        .map((v) => csvCell(v, delimiter))
        .join(delimiter),
    );
  }
  return lines.join('\r\n');
}

export type { HouseMember };
