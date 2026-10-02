import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { api, type CreateHouseInput, type HouseWithRole, type UpdateHouseInput } from '@/lib/db';
import { qk } from '@/lib/queryKeys';
import { newId } from '@/lib/storage';
import { useUiStore } from '@/lib/uiStore';

export function useMyHouses() {
  return useQuery({ queryKey: qk.houses, queryFn: api.listMyHouses });
}

/**
 * Resolves the active house from the persisted id (falls back to the first house and persists it).
 * `house` is undefined while loading or when the user has no house (→ onboarding).
 */
export function useActiveHouse(): {
  house: HouseWithRole | undefined;
  isAdmin: boolean;
  isLoading: boolean;
  houses: HouseWithRole[];
} {
  const { data, isLoading } = useMyHouses();
  const activeHouseId = useUiStore((s) => s.activeHouseId);
  const setActiveHouseId = useUiStore((s) => s.setActiveHouseId);
  const houses = data ?? [];
  const house = houses.find((h) => h.id === activeHouseId) ?? houses[0];
  useEffect(() => {
    if (house && house.id !== activeHouseId) setActiveHouseId(house.id);
  }, [house, activeHouseId, setActiveHouseId]);
  return { house, isAdmin: house?.role === 'ADMIN', isLoading, houses };
}

/** House with its members (REMOVED members included, with `removedAt`, needed for historical reports). */
export function useHouse(houseId: string | null | undefined) {
  return useQuery({
    queryKey: qk.house(houseId ?? ''),
    queryFn: () => api.getHouse({ houseId: houseId as string }),
    enabled: Boolean(houseId),
  });
}

/** Creates the house + the creator's ADMIN membership in one mutation and activates it. Resolves to the new id. */
export function useCreateHouse() {
  const qc = useQueryClient();
  const setActive = useUiStore((s) => s.setActiveHouseId);
  return useMutation({
    mutationFn: async (input: Omit<CreateHouseInput, 'id'>) => {
      const id = newId();
      await api.createHouse({ ...input, id });
      return id;
    },
    onSuccess: async (id) => {
      await qc.invalidateQueries({ queryKey: qk.houses });
      setActive(id);
    },
  });
}

export function useUpdateHouse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateHouseInput) => api.updateHouse(input),
    onSuccess: async (_d, v) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.houses }),
        qc.invalidateQueries({ queryKey: qk.house(v.houseId) }),
      ]);
    },
  });
}

/** Admin only; the UI must ask for explicit confirmation first. */
export function useDeleteHouse() {
  const qc = useQueryClient();
  const setActive = useUiStore((s) => s.setActiveHouseId);
  return useMutation({
    mutationFn: (houseId: string) => api.deleteHouse({ houseId }),
    onSuccess: async () => {
      setActive(null);
      await qc.invalidateQueries({ queryKey: qk.houses });
    },
  });
}
