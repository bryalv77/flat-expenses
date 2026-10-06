import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/db';
import { newId } from '@/lib/storage';
import { optimisticOptions } from '@/lib/optimistic';
import { qk } from '@/lib/queryKeys';
import { useUiStore } from '@/lib/uiStore';
import type { HouseInvite, HouseMember } from '@/types/domain';

import { generateInviteCode, normalizeInviteCode } from './inviteCode';

export function useMembers(houseId: string | null | undefined) {
  return useQuery({
    queryKey: qk.members(houseId ?? ''),
    queryFn: () => api.listMembers({ houseId: houseId as string }),
    enabled: Boolean(houseId),
  });
}

/** Admin only (server enforced); returns [] for roommates. */
export function useInvites(houseId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: qk.invites(houseId ?? ''),
    queryFn: () => api.listInvites({ houseId: houseId as string }),
    enabled: Boolean(houseId) && enabled,
  });
}

export interface CreateInviteInput {
  /** Days until expiry (default 7). */
  expiresInDays?: number;
  maxUses?: number;
}

/** Generates a code client-side and stores it. Resolves to the normalized (8 char) code. */
export function useCreateInvite(houseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ expiresInDays = 7, maxUses = 1 }: CreateInviteInput = {}) => {
      const code = generateInviteCode();
      const expiresAt = new Date(Date.now() + expiresInDays * 86_400_000).toISOString();
      await api.createInvite({ houseId, code, expiresAt, maxUses });
      return code;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.invites(houseId) }),
  });
}

export function useRevokeInvite(houseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (inviteId: string) => api.revokeInvite({ houseId, inviteId }),
    ...optimisticOptions<string, HouseInvite[]>(qc, qk.invites(houseId), (old, id) =>
      old.map((i) => (i.id === id ? { ...i, status: 'REVOKED' } : i)),
    ),
  });
}

/** Normalizes the code, redeems it and activates the newly joined house. Resolves to its id (if found). */
export function useRedeemInvite() {
  const qc = useQueryClient();
  const setActive = useUiStore((s) => s.setActiveHouseId);
  return useMutation({
    mutationFn: async (rawCode: string) => {
      const before = new Set((qc.getQueryData<{ id: string }[]>(qk.houses) ?? []).map((h) => h.id));
      await api.redeemInvite({ code: normalizeInviteCode(rawCode) });
      const houses = await qc.fetchQuery({
        queryKey: qk.houses,
        queryFn: api.listMyHouses,
        staleTime: 0,
      });
      const joined = houses.find((h) => !before.has(h.id)) ?? houses[0];
      if (joined) setActive(joined.id);
      return joined?.id ?? null;
    },
  });
}

function useMemberListMutation<TVars>(
  houseId: string,
  fn: (v: TVars) => Promise<void>,
  patch: (m: HouseMember, v: TVars) => HouseMember,
  match: (m: HouseMember, v: TVars) => boolean,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    ...optimisticOptions<TVars, HouseMember[]>(qc, qk.members(houseId), (old, v) =>
      old.map((m) => (match(m, v) ? patch(m, v) : m)),
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.house(houseId) }),
  });
}

export function useRemoveMember(houseId: string) {
  return useMemberListMutation<string>(
    houseId,
    (memberId) => api.removeMember({ houseId, memberId }),
    (m) => ({ ...m, status: 'REMOVED', removedAt: new Date().toISOString() }),
    (m, id) => m.id === id,
  );
}

export function useReactivateMember(houseId: string) {
  return useMemberListMutation<string>(
    houseId,
    (memberId) => api.reactivateMember({ houseId, memberId }),
    (m) => ({ ...m, status: 'ACTIVE', removedAt: null }),
    (m, id) => m.id === id,
  );
}

export function useSetMemberContribution(houseId: string) {
  return useMemberListMutation<{ memberId: string; cents: number | null }>(
    houseId,
    (v) =>
      api.setMemberContribution({
        houseId,
        memberId: v.memberId,
        individualContributionCents: v.cents,
      }),
    (m, v) => ({ ...m, individualContributionCents: v.cents }),
    (m, v) => m.id === v.memberId,
  );
}

export const GUEST_PREFIX = 'guest_';
/** Roommates registered by an admin without an account (past or present flatmates). */
export const isGuestMember = (m: { id: string }) => m.id.startsWith(GUEST_PREFIX);

export function useCreateGuestMember(houseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { displayName: string; joinedAt: string; removedAt: string | null; individualContributionCents: number | null }) =>
      api.createGuestMember({ ...v, houseId, id: GUEST_PREFIX + newId().replace(/-/g, '') }),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: qk.members(houseId) }), qc.invalidateQueries({ queryKey: qk.house(houseId) })]),
  });
}

/** Roommates only. */
export function useLeaveHouse() {
  const qc = useQueryClient();
  const setActive = useUiStore((s) => s.setActiveHouseId);
  return useMutation({
    mutationFn: (houseId: string) => api.leaveHouse({ houseId }),
    onSuccess: async () => {
      setActive(null);
      await qc.invalidateQueries({ queryKey: qk.houses });
    },
  });
}
