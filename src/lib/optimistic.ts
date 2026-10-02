import type { MutationOptions, QueryClient, QueryKey } from '@tanstack/react-query';

type Snapshot<T> = [QueryKey, T | undefined][];

/**
 * Optimistic-update helper for simple mutations: patches every cached query under `key`,
 * rolls back on error and always revalidates afterwards.
 */
export function optimisticOptions<TVars, TData>(
  qc: QueryClient,
  key: QueryKey,
  update: (old: TData, vars: TVars) => TData,
): Pick<MutationOptions<void, Error, TVars, { snapshots: Snapshot<TData> }>, 'onMutate' | 'onError' | 'onSettled'> {
  return {
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: key });
      const snapshots = qc.getQueriesData<TData>({ queryKey: key });
      qc.setQueriesData<TData>({ queryKey: key }, (old) => (old === undefined ? old : update(old, vars)));
      return { snapshots };
    },
    onError: (_error, _vars, ctx) => {
      ctx?.snapshots.forEach(([k, data]) => qc.setQueryData(k, data));
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key });
    },
  };
}
