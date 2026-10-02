import type { HouseMember } from '@/types/domain';
import { monthEnd, monthStart } from '@/lib/dates';

export type MemberLike = Pick<
  HouseMember,
  'id' | 'role' | 'status' | 'joinedAt' | 'removedAt' | 'individualContributionCents'
>;

/** Was the member part of the house at any point during the month (`YYYY-MM`)? */
export function isMemberActiveInMonth(member: MemberLike, month: string): boolean {
  const joined = member.joinedAt.slice(0, 10);
  if (joined > monthEnd(month)) return false;
  if (member.removedAt) return member.removedAt.slice(0, 10) >= monthStart(month);
  return member.status === 'ACTIVE';
}

/** Members active during the month, ordered by join date (then id) for deterministic cent distribution. */
export function activeMembersInMonth<T extends MemberLike>(members: T[], month: string): T[] {
  return members
    .filter((m) => isMemberActiveInMonth(m, month))
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt) || a.id.localeCompare(b.id));
}
