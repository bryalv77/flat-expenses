import type { ExpenseCategory, IntervalUnit, Locale } from '@/types/domain';
import { addDays, addMonthsClamped, toDayNumber } from '@/lib/dates';
import { formatMoney } from '@/lib/format';

type ScheduleFields = Pick<ExpenseCategory, 'intervalUnit' | 'intervalCount' | 'anchorDate'>;

const AVG_DAYS_PER_MONTH = 30.4375;
const MAX_ITERATIONS = 5000;

/** The n-th occurrence (n >= 0), always computed from the anchor so month-ends never drift. */
export function occurrenceAt(schedule: ScheduleFields, n: number): string {
  const count = Math.max(1, schedule.intervalCount);
  switch (schedule.intervalUnit) {
    case 'DAY':
      return addDays(schedule.anchorDate, n * count);
    case 'WEEK':
      return addDays(schedule.anchorDate, n * count * 7);
    case 'MONTH':
      return addMonthsClamped(schedule.anchorDate, n * count);
    case 'YEAR':
      return addMonthsClamped(schedule.anchorDate, n * count * 12);
  }
}

function approxStepDays(schedule: ScheduleFields): number {
  const count = Math.max(1, schedule.intervalCount);
  switch (schedule.intervalUnit) {
    case 'DAY':
      return count;
    case 'WEEK':
      return count * 7;
    case 'MONTH':
      return count * AVG_DAYS_PER_MONTH;
    case 'YEAR':
      return count * 365.25;
  }
}

function startIndex(schedule: ScheduleFields, from: string): number {
  const offset = toDayNumber(from) - toDayNumber(schedule.anchorDate);
  return Math.max(0, Math.floor(offset / approxStepDays(schedule)) - 1);
}

/** All occurrences within [from, to] inclusive. The anchor date is the first occurrence. */
export function getOccurrences(schedule: ScheduleFields, from: string, to: string): string[] {
  if (from > to) return [];
  const out: string[] = [];
  let n = startIndex(schedule, from);
  for (let i = 0; i < MAX_ITERATIONS; i++, n++) {
    const date = occurrenceAt(schedule, n);
    if (date > to) break;
    if (date >= from) out.push(date);
  }
  return out;
}

/** First occurrence on or after `today`. */
export function getNextOccurrence(schedule: ScheduleFields, today: string): string | null {
  let n = startIndex(schedule, today);
  for (let i = 0; i < MAX_ITERATIONS; i++, n++) {
    const date = occurrenceAt(schedule, n);
    if (date >= today) return date;
  }
  return null;
}

export interface UpcomingCharge {
  category: ExpenseCategory;
  date: string;
  expectedAmountCents: number | null;
}

/** Upcoming charges for active categories within the next `days` days (inclusive of today). */
export function getUpcomingCharges(
  categories: ExpenseCategory[],
  today: string,
  days = 30,
): UpcomingCharge[] {
  const to = addDays(today, days);
  const out: UpcomingCharge[] = [];
  for (const category of categories) {
    if (!category.isActive) continue;
    for (const date of getOccurrences(category, today, to)) {
      out.push({ category, date, expectedAmountCents: category.expectedAmountCents });
    }
  }
  return out.sort(
    (a, b) => a.date.localeCompare(b.date) || a.category.sortOrder - b.category.sortOrder,
  );
}

/** Number of months one billing cycle covers (fractional for DAY/WEEK). */
export function cycleLengthInMonths(
  schedule: Pick<ScheduleFields, 'intervalUnit' | 'intervalCount'>,
): number {
  const count = Math.max(1, schedule.intervalCount);
  switch (schedule.intervalUnit) {
    case 'DAY':
      return count / AVG_DAYS_PER_MONTH;
    case 'WEEK':
      return (count * 7) / AVG_DAYS_PER_MONTH;
    case 'MONTH':
      return count;
    case 'YEAR':
      return count * 12;
  }
}

/** Amortized monthly cost of one bill: a bi-monthly 80 € gas bill -> 40 €/month. */
export function amortizedMonthlyCents(
  schedule: Pick<ScheduleFields, 'intervalUnit' | 'intervalCount'>,
  amountCents: number,
): number {
  return Math.round(amountCents / cycleLengthInMonths(schedule));
}

const UNIT_LABELS: Record<Locale, Record<IntervalUnit, [string, string]>> = {
  es: {
    DAY: ['día', 'días'],
    WEEK: ['semana', 'semanas'],
    MONTH: ['mes', 'meses'],
    YEAR: ['año', 'años'],
  },
  en: {
    DAY: ['day', 'days'],
    WEEK: ['week', 'weeks'],
    MONTH: ['month', 'months'],
    YEAR: ['year', 'years'],
  },
};

export interface ScheduleDescription {
  interval: string; // "Cada 4 semanas"
  amount: string; // "15,00 €" | "variable"
  full: string; // "Cada 4 semanas · 15,00 €"
}

export function describeSchedule(
  category: Pick<
    ExpenseCategory,
    'intervalUnit' | 'intervalCount' | 'amountType' | 'expectedAmountCents'
  >,
  locale: Locale = 'es',
): ScheduleDescription {
  const [singular, plural] = UNIT_LABELS[locale][category.intervalUnit];
  const count = category.intervalCount;
  const every = locale === 'es' ? 'Cada' : 'Every';
  const interval = count === 1 ? `${every} ${singular}` : `${every} ${count} ${plural}`;
  let amount = 'variable';
  if (category.expectedAmountCents != null) {
    const money = formatMoney(category.expectedAmountCents, locale);
    amount = category.amountType === 'FIXED' ? money : `~${money}`;
  }
  return { interval, amount, full: `${interval} · ${amount}` };
}
