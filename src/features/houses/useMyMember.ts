import { useAuth } from '@/features/auth/AuthContext';
import { useHouse } from '@/features/houses/hooks';
import type { HouseMember } from '@/types/domain';

/** The signed-in user's membership in the given house, plus all members. */
export function useMyMember(houseId: string | null | undefined): { me: HouseMember | undefined; members: HouseMember[]; isLoading: boolean } {
  const { authUser } = useAuth();
  const { data, isLoading } = useHouse(houseId);
  const members = data?.members ?? [];
  return { me: members.find((m) => m.userId === authUser?.uid), members, isLoading };
}
