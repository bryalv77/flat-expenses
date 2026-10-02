import type { Bill, HouseMember } from '@/types/domain';
import { getEffectiveMonth } from './effectiveDate';
import { activeMembersInMonth, type MemberLike } from './members';

export interface Share {
  memberId: string;
  cents: number;
}

/**
 * Splits `totalCents` among `memberIds` (assumed already ordered by join date).
 * Everyone gets floor(total/n); the leftover cents go one each to the first members (largest remainder,
 * all remainders being equal, so ties are broken by order).
 */
export function splitEqual(totalCents: number, memberIds: string[]): Share[] {
  const n = memberIds.length;
  if (n === 0) return [];
  const sign = totalCents < 0 ? -1 : 1;
  const abs = Math.abs(Math.round(totalCents));
  const base = Math.floor(abs / n);
  const remainder = abs - base * n;
  return memberIds.map((memberId, i) => ({
    memberId,
    cents: sign * (base + (i < remainder ? 1 : 0)),
  }));
}

export interface CategoryShare {
  categoryId: string;
  totalCents: number;
  perMember: Share[];
}

export interface MonthShares {
  month: string;
  totalCents: number;
  memberIds: string[];
  perMember: Share[];
  perCategory: CategoryShare[];
}

/** Mode A: equal split of a month's bills among the members active in that month. */
export function computeMonthShares(
  bills: Pick<Bill, 'amountCents' | 'categoryId' | 'chargeDate' | 'periodEndDate' | 'createdAt'>[],
  members: MemberLike[],
  month: string,
): MonthShares {
  const active = activeMembersInMonth(members, month);
  const ids = active.map((m) => m.id);
  const inMonth = bills.filter((b) => getEffectiveMonth(b) === month);
  const byCategory = new Map<string, number>();
  let total = 0;
  for (const b of inMonth) {
    total += b.amountCents;
    byCategory.set(b.categoryId, (byCategory.get(b.categoryId) ?? 0) + b.amountCents);
  }
  const perCategory: CategoryShare[] = [...byCategory.entries()]
    .map(([categoryId, totalCents]) => ({
      categoryId,
      totalCents,
      perMember: splitEqual(totalCents, ids),
    }))
    .sort((a, b) => b.totalCents - a.totalCents);
  return {
    month,
    totalCents: total,
    memberIds: ids,
    perMember: splitEqual(total, ids),
    perCategory,
  };
}

export type { HouseMember };
