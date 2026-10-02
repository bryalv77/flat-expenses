import type { ExpenseCategory, House } from '@/types/domain';
import { addMonthsToKey, monthEnd, monthRange, monthStart } from '@/lib/dates';
import { getEffectiveDate, getEffectiveMonth } from '@/features/finance/effectiveDate';
import { computeMonthBalance, type MonthBalance } from '@/features/finance/contributions';
import { activeMembersInMonth, type MemberLike } from '@/features/finance/members';
import { splitEqual, type Share } from '@/features/finance/split';
import { getOccurrences } from '@/features/schedule/occurrences';
import { computeSeasonality, type BillCore } from './calculations';

export type ProjectionBasis = 'SCHEDULE' | 'LAST_YEAR' | 'TRAILING_AVERAGE' | 'NONE';
export type ProjectionConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface CategoryProjection {
  categoryId: string;
  basis: ProjectionBasis;
  occurrences: number;
  estimateCents: number;
  lowCents: number;
  highCents: number;
}

export interface MonthProjection {
  month: string;
  totalCents: number;
  lowCents: number;
  highCents: number;
  perCategory: CategoryProjection[];
  confidence: ProjectionConfidence;
  /** Distinct months between the first and last bill, inclusive. */
  monthsOfData: number;
  /** Mode A: equal share per active member. */
  perPerson: Share[];
  /** Mode B: expected contributions vs projected spend (also for low/high). */
  balance: MonthBalance;
  balanceLowSpendCents: number;
  balanceHighSpendCents: number;
}

export interface ProjectionOptions {
  /** How many of the latest bills feed the weighted average. */
  trailingBills?: number;
  /** Seasonal factor bounds. */
  minSeasonalFactor?: number;
  maxSeasonalFactor?: number;
}

type ProjectionBill = BillCore;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Recency-weighted mean: the i-th oldest of n values has weight i+1. */
export function weightedRecentAverage(values: number[]): number | null {
  if (values.length === 0) return null;
  let num = 0;
  let den = 0;
  values.forEach((v, i) => {
    num += v * (i + 1);
    den += i + 1;
  });
  return num / den;
}

function coefficientOfVariation(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  if (mean === 0) return null;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance) / mean;
}

function monthsOfData(bills: ProjectionBill[]): number {
  if (bills.length === 0) return 0;
  const months = bills.map(getEffectiveMonth).sort();
  return monthRange(months[0], months[months.length - 1]).length;
}

export function projectionConfidence(months: number): ProjectionConfidence {
  if (months >= 12) return 'HIGH';
  if (months >= 6) return 'MEDIUM';
  return 'LOW';
}

function projectCategory(
  category: ExpenseCategory,
  bills: ProjectionBill[],
  allCategories: ExpenseCategory[],
  allBills: ProjectionBill[],
  targetMonth: string,
  hasYearOfData: boolean,
  options: Required<ProjectionOptions>,
): CategoryProjection {
  const occurrences = getOccurrences(
    category,
    monthStart(targetMonth),
    monthEnd(targetMonth),
  ).length;
  const none: CategoryProjection = {
    categoryId: category.id,
    basis: 'NONE',
    occurrences,
    estimateCents: 0,
    lowCents: 0,
    highCents: 0,
  };
  if (occurrences === 0)
    return { ...none, basis: category.amountType === 'FIXED' ? 'SCHEDULE' : 'NONE' };

  const own = bills
    .filter((b) => b.categoryId === category.id)
    .sort((a, b) => getEffectiveDate(a).localeCompare(getEffectiveDate(b)));

  if (category.amountType === 'FIXED') {
    const unit =
      category.expectedAmountCents ??
      Math.round(
        weightedRecentAverage(own.slice(-options.trailingBills).map((b) => b.amountCents)) ?? 0,
      );
    const total = unit * occurrences;
    return { ...none, basis: 'SCHEDULE', estimateCents: total, lowCents: total, highCents: total };
  }

  // VARIABLE: (a) same month last year, else (b) weighted trailing average with seasonal adjustment.
  const lastYearMonth = addMonthsToKey(targetMonth, -12);
  const lastYear = own.filter((b) => getEffectiveMonth(b) === lastYearMonth);
  const recent = own.slice(-options.trailingBills);
  const cv = coefficientOfVariation(recent.map((b) => b.amountCents));
  const hasEstimateFallback = category.expectedAmountCents != null;
  const spread = clamp(cv ?? (hasEstimateFallback ? 0.3 : 0.5), 0.05, 0.5);

  let estimate: number;
  let basis: ProjectionBasis;
  if (lastYear.length > 0) {
    estimate = lastYear.reduce((s, b) => s + b.amountCents, 0);
    basis = 'LAST_YEAR';
  } else {
    const avg = weightedRecentAverage(recent.map((b) => b.amountCents));
    if (avg === null) {
      if (category.expectedAmountCents == null) return none;
      estimate = category.expectedAmountCents * occurrences;
      basis = 'SCHEDULE';
    } else {
      let factor = 1;
      if (hasYearOfData) {
        const season = computeSeasonality(allBills, allCategories, category.id);
        const yearly = season.yearlyAverageCents;
        const factorOf = (moy: number): number | null => {
          const a = season.byMonthOfYear[moy - 1].averageCents;
          return yearly && a !== null ? a / yearly : null;
        };
        const target = factorOf(Number(targetMonth.slice(5, 7)));
        const windowFactors = recent
          .map((b) => factorOf(Number(getEffectiveMonth(b).slice(5, 7))))
          .filter((f): f is number => f !== null);
        const windowFactor = windowFactors.length
          ? windowFactors.reduce((s, f) => s + f, 0) / windowFactors.length
          : 1;
        if (target !== null && windowFactor > 0) {
          factor = clamp(
            target / windowFactor,
            options.minSeasonalFactor,
            options.maxSeasonalFactor,
          );
        }
      }
      estimate = avg * factor * occurrences;
      basis = 'TRAILING_AVERAGE';
    }
  }
  const rounded = Math.round(estimate);
  return {
    categoryId: category.id,
    basis,
    occurrences,
    estimateCents: rounded,
    lowCents: Math.round(rounded * (1 - spread)),
    highCents: Math.round(rounded * (1 + spread)),
  };
}

/**
 * Projects the spend of a (typically future) month.
 * FIXED categories: schedule occurrences x expected amount. VARIABLE categories: same month last year if
 * available, else a recency-weighted average of the latest bills adjusted by a seasonal factor once there
 * are >= 12 months of data. A VARIABLE category with no scheduled occurrence in the month contributes 0.
 */
export function projectMonth(params: {
  targetMonth: string;
  categories: ExpenseCategory[];
  bills: ProjectionBill[];
  members: MemberLike[];
  house: Pick<House, 'fixedContributionCents'>;
  options?: ProjectionOptions;
}): MonthProjection {
  const { targetMonth, categories, bills, members, house } = params;
  const options: Required<ProjectionOptions> = {
    trailingBills: params.options?.trailingBills ?? 6,
    minSeasonalFactor: params.options?.minSeasonalFactor ?? 0.5,
    maxSeasonalFactor: params.options?.maxSeasonalFactor ?? 2,
  };
  const months = monthsOfData(bills);
  const hasYearOfData = months >= 12;

  const perCategory = categories
    .filter((c) => c.isActive)
    .map((c) => projectCategory(c, bills, categories, bills, targetMonth, hasYearOfData, options))
    .sort((a, b) => b.estimateCents - a.estimateCents);

  const totalCents = perCategory.reduce((s, c) => s + c.estimateCents, 0);
  const lowCents = perCategory.reduce((s, c) => s + c.lowCents, 0);
  const highCents = perCategory.reduce((s, c) => s + c.highCents, 0);
  const active = activeMembersInMonth(members, targetMonth);

  return {
    month: targetMonth,
    totalCents,
    lowCents,
    highCents,
    perCategory,
    confidence: projectionConfidence(months),
    monthsOfData: months,
    perPerson: splitEqual(
      totalCents,
      active.map((m) => m.id),
    ),
    balance: computeMonthBalance(house, members, targetMonth, totalCents),
    balanceLowSpendCents: computeMonthBalance(house, members, targetMonth, lowCents).balanceCents,
    balanceHighSpendCents: computeMonthBalance(house, members, targetMonth, highCents).balanceCents,
  };
}
