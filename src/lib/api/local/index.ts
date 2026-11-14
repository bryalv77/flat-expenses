import type { Api } from '../types';
import { makeBillsApi } from './bills';
import { makeCategoriesApi } from './categories';
import { LOCAL_USER_ID, type LocalCtx } from './ctx';
import { makeHousesApi } from './houses';
import { makeMembersApi } from './members';
import { makePaymentsApi } from './payments';
import type { SqlDb } from './sql';
import { makeUserApi } from './user';

export class NotImplementedError extends Error {
  constructor(what: string) {
    super(`Not implemented: ${what}`);
    this.name = 'NotImplementedError';
  }
}

/** Methods that only make sense with an account; local mode refuses them instead of faking them. */
const UNAVAILABLE = [
  'listMyDocuments', 'addMyDocument', 'deleteMyDocument', 'listMemberDocuments', 'deleteMyAccountData',
  'createInvite', 'revokeInvite', 'listInvites', 'redeemInvite', 'leaveHouse',
] as const;

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
  const impl: Record<string, unknown> = {
    ...makeUserApi(ctx), ...makeHousesApi(ctx), ...makeMembersApi(ctx),
    ...makeCategoriesApi(ctx), ...makeBillsApi(ctx), ...makePaymentsApi(ctx),
  };
  // Anything not (yet) implemented rejects with a clear error instead of `undefined is not a function`.
  return new Proxy(impl as unknown as Api, {
    get: (t, name) => (name in t ? (t as never)[name] : async () => {
      throw new NotImplementedError(`localApi.${String(name)}${(UNAVAILABLE as readonly string[]).includes(String(name)) ? ' (not available in local mode)' : ''}`);
    }),
  });
}

/** App singleton: opens the on-device database on first use. */
let pending: Promise<Api> | undefined;
export const localApi: Api = new Proxy({} as Api, {
  get: (_t, name) => async (...args: unknown[]) => {
    pending ??= import('./sql.expo').then(async (m) => createLocalApi(await m.openLocalDb()));
    const api = await pending;
    return (api as never as Record<string, (...a: unknown[]) => unknown>)[name as string](...args);
  },
});
