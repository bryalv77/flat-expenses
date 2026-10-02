import { useAuth } from '@/features/auth';
import { useHouse } from '@/features/houses/hooks';
import type { HouseMember } from '@/types/domain';

/** The signed-in user's membership in the given house, plus all members. */
export function useMyMember(houseId: string | null | undefined): { me: HouseMember | undefined; members: HouseMember[]; isLoading: boolean } {
  const { firebaseUser } = useAuth();
  const { data, isLoading } = useHouse(houseId);
  const members = data?.members ?? [];
  return { me: members.find((m) => m.userId === firebaseUser?.uid), members, isLoading };
}
