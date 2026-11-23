import type { ExpenseCategory } from '@/types/domain';
import { addMonthsToKey, monthIndex, monthKey, monthRange } from '@/lib/dates';
import { totalsByMonth, type BillCore } from '@/features/finance/effectiveDate';
import { clamp, coefficientOfVariation, mean, weightedRecentAverage } from '@/features/finance/stats';
import { getUpcomingCharges } from './occurrences';

/**
 * "Smart" upcoming charges: learns from the bill history instead of trusting each category's calendar.
 *  - cadence: how often (every p months) and on which months a category is actually billed (e.g. gas on even months);
 *  - amount: stable series -> last amount; otherwise same month last year x recent year-over-year growth;
 *    otherwise a recency-weighted average. A low/high range comes from the recent variability.
 * Categories with too little history fall back to their configured schedule.
 */
export type SmartBasis = 'STABLE' | 'SEASONAL' | 'RECENT' | 'SCHEDULE';

export interface SmartCharge {
  category: ExpenseCategory;
  /** `YYYY-MM` the charge is expected in. */
  month: string;
  /** Exact day when known (schedule fallback); otherwise null and only the month is predicted. */
  date: string | null;
  estimateCents: number | null;
  lowCents: number | null;
  highCents: number | null;
  /** Billed every N months (null for the schedule fallback). */
  everyMonths: number | null;
  basis: SmartBasis;
}

const CYCLES = [1, 2, 3, 4, 6, 12];
const WINDOW_MONTHS = 24;
const MIN_HISTORY = 3;

const cv = (v: number[]) => coefficientOfVariation(v) ?? 0;

/** Smallest cycle (in months) and residue such that billed months line up with `idx % cycle === residue`. */
export function detectCycle(billed: Set<string>, firstMonth: string, lastMonth: string): { every: number; residue: number } | null {
  const months = monthRange(firstMonth, lastMonth);
  const billedMonths = months.filter((m) => billed.has(m));
  if (billedMonths.length < MIN_HISTORY) return null;
  for (const every of CYCLES) {
    let best: { residue: number; hits: number; expected: number } | null = null;
    for (let residue = 0; residue < every; residue++) {
      const expected = months.filter((m) => monthIndex(m) % every === residue);
      const hits = expected.filter((m) => billed.has(m)).length;
      if (!best || hits > best.hits) best = { residue, hits, expected: expected.length };
    }
    if (!best || best.expected === 0) continue;
    const stray = billedMonths.length - best.hits;
    if (best.hits / best.expected >= 0.75 && stray / billedMonths.length <= 0.2) return { every, residue: best.residue };
  }
  return null;
}

function estimate(totals: Record<string, number>, target: string): { cents: number; low: number; high: number; basis: SmartBasis } {
  const keys = Object.keys(totals).sort();
  const values = keys.map((k) => totals[k]!);
  const recent = values.slice(-6);
  const last3 = values.slice(-3);

  // Stable (rent, internet, a flat cleaning fee): trust the latest amount, including a fresh step up.
  if (last3.length >= 3 && cv(last3) < 0.03) {
    const c = values[values.length - 1];
    return { cents: Math.round(c), low: Math.round(c * 0.98), high: Math.round(c * 1.02), basis: 'STABLE' };
  }

  // Seasonal: same month last year, scaled by how much the latest occurrences grew vs. a year earlier.
  const lastYear = totals[addMonthsToKey(target, -12)];
  if (lastYear != null) {
    const pairs = keys
      .slice(-3)
      .map((k) => [totals[k]!, totals[addMonthsToKey(k, -12)]] as const)
      .filter((p): p is readonly [number, number] => p[1] != null && p[1] > 0);
    const ratio = pairs.length >= 2 ? clamp((mean(pairs.map((p) => p[0])) ?? 0) / (mean(pairs.map((p) => p[1])) ?? 0), 0.7, 1.6) : 1;
    const c = lastYear * ratio;
    const spread = clamp(cv(recent), 0.1, 0.5);
    return { cents: Math.round(c), low: Math.round(c * (1 - spread)), high: Math.round(c * (1 + spread)), basis: 'SEASONAL' };
  }

  const c = weightedRecentAverage(recent) ?? 0;
  const spread = clamp(cv(recent), 0.1, 0.5);
  return { cents: Math.round(c), low: Math.round(c * (1 - spread)), high: Math.round(c * (1 + spread)), basis: 'RECENT' };
}

/** Charges expected in the current month (if not billed yet) and the next `monthsAhead` months. */
export function getSmartUpcoming(
  categories: ExpenseCategory[],
  bills: BillCore[],
  today: string,
  monthsAhead = 1,
): SmartCharge[] {
  const current = monthKey(today);
  const targets = monthRange(current, addMonthsToKey(current, monthsAhead));
  const out: SmartCharge[] = [];

  for (const category of categories) {
    if (!category.isActive) continue;
    const totals = totalsByMonth(bills.filter((b) => b.categoryId === category.id && b.amountCents > 0));
    const sorted = Object.keys(totals).sort();
    const windowStart = addMonthsToKey(current, -WINDOW_MONTHS);
    const first = sorted.find((m) => m >= windowStart);
    const lastBilled = sorted[sorted.length - 1];
    const cycle = first && lastBilled ? detectCycle(new Set(sorted), first, addMonthsToKey(current, -1) > lastBilled ? addMonthsToKey(current, -1) : lastBilled) : null;
    // Stopped being billed (cancelled provider)? Don't predict anything.
    const stale = lastBilled != null && monthIndex(current) - monthIndex(lastBilled) > 12;

    if (!cycle || stale) {
      if (sorted.length >= MIN_HISTORY) continue; // irregular or discontinued: nothing reliable to say
      for (const u of getUpcomingCharges([category], today, 30)) {
        out.push({ category, month: u.date.slice(0, 7), date: u.date, estimateCents: u.expectedAmountCents, lowCents: null, highCents: null, everyMonths: null, basis: 'SCHEDULE' });
      }
      continue;
    }

    for (const month of targets) {
      if (monthIndex(month) % cycle.every !== cycle.residue || month in totals) continue;
      const est = estimate(totals, month);
      out.push({ category, month, date: null, estimateCents: est.cents, lowCents: est.low, highCents: est.high, everyMonths: cycle.every, basis: est.basis });
    }
  }
  return out.sort((a, b) => a.month.localeCompare(b.month) || a.category.sortOrder - b.category.sortOrder);
}
