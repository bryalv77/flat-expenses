import type { HouseMember } from '@/types/domain';
import { dayOf, monthEnd, monthStart } from '@/lib/dates';

export type MemberLike = Pick<
  HouseMember,
  'id' | 'role' | 'status' | 'joinedAt' | 'removedAt' | 'individualContributionCents'
>;

/** Was the member part of the house at any point during the month (`YYYY-MM`)? */
function isMemberActiveInMonth(member: MemberLike, month: string): boolean {
  const joined = dayOf(member.joinedAt);
  if (joined > monthEnd(month)) return false;
  if (member.removedAt) return dayOf(member.removedAt) >= monthStart(month);
  return member.status === 'ACTIVE';
}

/** Members active during the month, ordered by join date (then id) for deterministic cent distribution. */
export function activeMembersInMonth<T extends MemberLike>(members: T[], month: string): T[] {
  return members
    .filter((m) => isMemberActiveInMonth(m, month))
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt) || a.id.localeCompare(b.id));
}
