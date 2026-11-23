import type { House, MemberPayment } from '@/types/domain';
import { daysInMonth, monthKey, monthNumber, monthRange, parseISODate } from '@/lib/dates';
import { activeMembersInMonth, activeRoommatesInMonth, type MemberLike } from './members';
import { splitEqual } from './split';

export type BalanceStatus = 'SUFFICIENT' | 'INSUFFICIENT' | 'SURPLUS';
export type PaymentState = 'PAID' | 'PARTIAL' | 'PENDING' | 'OVERPAID';

type ContributionHouse = Pick<House, 'fixedContributionCents'>;

/** Per-member override wins over the house-wide fixed contribution. */
function contributionForMember(house: ContributionHouse, member: MemberLike): number {
  return member.individualContributionCents ?? house.fixedContributionCents ?? 0;
}

/**
 * What the member owes for `month`: the monthly contribution, prorated by the days of that month they lived in the flat.
 * Day of entry is not charged (the previous roommate pays it) and day of exit is: joining on day 9 of a 30-day month
 * pays 21/30, leaving on day 9 pays 9/30, so a hand-over day adds up to the whole month. Joining on day 1 pays all of it.
 */
export function dueForMember(house: ContributionHouse, member: MemberLike, month: string): number {
  const full = contributionForMember(house, member);
  const dim = daysInMonth(+month.slice(0, 4), monthNumber(month));
  const joinDay = parseISODate(member.joinedAt).d;
  const from = monthKey(member.joinedAt) === month && joinDay > 1 ? joinDay : 0;
  const to = member.removedAt && monthKey(member.removedAt) === month ? parseISODate(member.removedAt).d : dim;
  return Math.round((full * Math.max(0, to - from)) / dim);
}

function balanceStatus(balanceCents: number): BalanceStatus {
  if (balanceCents < 0) return 'INSUFFICIENT';
  if (balanceCents === 0) return 'SUFFICIENT';
  return 'SURPLUS';
}

export interface MonthBalance {
  month: string;
  totalSpentCents: number;
  expectedIncomeCents: number;
  balanceCents: number;
  status: BalanceStatus;
  /** Equal-split share each active member would have owed (Mode A view), by member id. */
  equalShares: { memberId: string; cents: number }[];
  /** What each active roommate is charged in Mode B, by member id. */
  contributions: { memberId: string; cents: number }[];
}

/** Mode B: expected income (active roommates' contributions) vs. what was spent. */
export function computeMonthBalance(
  house: ContributionHouse,
  members: MemberLike[],
  month: string,
  totalSpentCents: number,
): MonthBalance {
  const active = activeMembersInMonth(members, month);
  const contributions = activeRoommatesInMonth(members, month)
    .map((m) => ({ memberId: m.id, cents: dueForMember(house, m, month) }));
  const expectedIncomeCents = contributions.reduce((s, c) => s + c.cents, 0);
  const balanceCents = expectedIncomeCents - totalSpentCents;
  return {
    month,
    totalSpentCents,
    expectedIncomeCents,
    balanceCents,
    status: balanceStatus(balanceCents),
    equalShares: splitEqual(
      totalSpentCents,
      active.map((m) => m.id),
    ),
    contributions,
  };
}

export interface BalanceSeriesRow extends MonthBalance {
  cumulativeBalanceCents: number;
}

/** Month-by-month balance with a running cumulative total. `totalsByMonth` maps `YYYY-MM` to cents. */
export function computeBalanceSeries(
  house: ContributionHouse,
  members: MemberLike[],
  fromMonth: string,
  toMonth: string,
  totalsByMonth: Record<string, number>,
): BalanceSeriesRow[] {
  let cumulative = 0;
  return monthRange(fromMonth, toMonth).map((month) => {
    const row = computeMonthBalance(house, members, month, totalsByMonth[month] ?? 0);
    cumulative += row.balanceCents;
    return { ...row, cumulativeBalanceCents: cumulative };
  });
}

export interface ContributionRecommendation {
  /** Average monthly spend over the window. */
  averageMonthlySpendCents: number;
  /** Per-roommate monthly contribution that breaks even. */
  breakEvenCents: number;
  /** Per-roommate monthly contribution that also keeps `marginCents` per month. */
  withMarginCents: number;
  monthsConsidered: number;
}

/**
 * Break-even recommendation from the trailing months' totals (oldest -> newest; pass 3-12 values).
 * Rounded up to the next cent per roommate so the house never ends short.
 */
export function recommendContribution(
  trailingMonthlyTotals: number[],
  roommateCount: number,
  marginCents = 0,
): ContributionRecommendation | null {
  if (trailingMonthlyTotals.length === 0 || roommateCount <= 0) return null;
  const avg = trailingMonthlyTotals.reduce((s, t) => s + t, 0) / trailingMonthlyTotals.length;
  return {
    averageMonthlySpendCents: Math.round(avg),
    breakEvenCents: Math.ceil(avg / roommateCount),
    withMarginCents: Math.ceil((avg + marginCents) / roommateCount),
    monthsConsidered: trailingMonthlyTotals.length,
  };
}

export interface MemberPaymentStatus {
  memberId: string;
  dueCents: number;
  paidCents: number;
  pendingCents: number;
  state: PaymentState;
}

export interface MonthPaymentSummary {
  month: string;
  perMember: MemberPaymentStatus[];
  totalDueCents: number;
  totalPaidCents: number;
  totalPendingCents: number;
}

/** Paid/pending per active roommate for a month (Mode B). Payments are matched by their `month`. */
export function computePaymentStatus(
  house: ContributionHouse,
  members: MemberLike[],
  payments: Pick<MemberPayment, 'memberId' | 'month' | 'amountCents'>[],
  month: string,
): MonthPaymentSummary {
  const roommates = activeRoommatesInMonth(members, month);
  const perMember = roommates.map((m): MemberPaymentStatus => {
    const dueCents = dueForMember(house, m, month);
    const paidCents = payments
      .filter((p) => p.memberId === m.id && monthKey(p.month) === month)
      .reduce((s, p) => s + p.amountCents, 0);
    const pendingCents = Math.max(0, dueCents - paidCents);
    let state: PaymentState = 'PENDING';
    if (paidCents > dueCents) state = 'OVERPAID';
    else if (paidCents === dueCents) state = 'PAID';
    else if (paidCents > 0) state = 'PARTIAL';
    return { memberId: m.id, dueCents, paidCents, pendingCents, state };
  });
  return {
    month,
    perMember,
    totalDueCents: perMember.reduce((s, p) => s + p.dueCents, 0),
    totalPaidCents: perMember.reduce((s, p) => s + p.paidCents, 0),
    totalPendingCents: perMember.reduce((s, p) => s + p.pendingCents, 0),
  };
}
