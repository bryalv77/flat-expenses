import type { Api } from '../types';
import { makeBillsApi } from './bills';
import { makeCategoriesApi } from './categories';
import { LOCAL_USER_ID, type LocalCtx } from './ctx';
import { makeHousesApi } from './houses';
import { makeMembersApi } from './members';
import { makePaymentsApi } from './payments';
import type { SqlDb } from './sql';
import { makeUserApi } from './user';

/** Methods that only make sense with an account; local mode refuses them instead of faking them. */
const UNAVAILABLE = [
  'listMyDocuments', 'addMyDocument', 'deleteMyDocument', 'createInvite', 'revokeInvite', 'listInvites', 'redeemInvite', 'leaveHouse',
] as const satisfies readonly (keyof Api)[];
const unavailable = Object.fromEntries(
  UNAVAILABLE.map((name) => [name, async () => { throw new Error(`${name} is not available in local mode`); }]),
);

export function createLocalApi(
  db: SqlDb,
  opts: Partial<Pick<LocalCtx, 'userId' | 'now' | 'deleteFiles' | 'deleteFolder'>> = {},
): Api {
  const ctx: LocalCtx = {
    db,
    userId: opts.userId ?? LOCAL_USER_ID,
    now: opts.now ?? (() => new Date().toISOString()),
    deleteFiles: opts.deleteFiles ?? (async () => undefined),
    deleteFolder: opts.deleteFolder ?? (async () => undefined),
  };
  return {
    ...unavailable,
    ...makeUserApi(ctx), ...makeHousesApi(ctx), ...makeMembersApi(ctx),
    ...makeCategoriesApi(ctx), ...makeBillsApi(ctx), ...makePaymentsApi(ctx),
  } as Api;
}

/** App singleton: opens the on-device database on first use. */
let pending: Promise<Api> | undefined;
export const localApi: Api = new Proxy({} as Api, {
  // 'then'/symbols -> undefined, else `await localApi` treats the proxy as a thenable and calls it.
  get: (_t, name) => (name === 'then' || typeof name === 'symbol') ? undefined : async (...args: unknown[]) => {
    // require, not import(): Jest's VM rejects dynamic import(); lazy so tests never load expo-sqlite.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    pending ??= (require('./sql.expo') as typeof import('./sql.expo')).getLocalDb().then((db) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { localFileStore } = require('../../fileStore.local') as typeof import('../../fileStore.local');
      return createLocalApi(db, {
        deleteFiles: async (paths) => void (await Promise.all(paths.map((p) => localFileStore.delete(p)))),
        deleteFolder: (prefix) => localFileStore.deleteFolder!(prefix),
      });
    });
    const api = await pending;
    return (api as never as Record<string, (...a: unknown[]) => unknown>)[name as string](...args);
  },
});
