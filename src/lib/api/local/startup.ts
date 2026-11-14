import { getFileStore } from '../../fileStore';
import { sweepOrphanFiles } from './bills';
import { LOCAL_USER_ID } from './ctx';
import type { SqlDb } from './sql';

interface Deps {
  getDb: () => Promise<SqlDb>;
  list: () => Promise<string[]>;
  remove: (path: string) => Promise<void>;
}

const defaults: Deps = {
  // require, not import(): Jest's VM rejects dynamic import().
  getDb: () => (require('./sql.expo') as typeof import('./sql.expo')).getLocalDb(),
  list: async () => (await getFileStore().list?.('')) ?? [],
  remove: (p) => getFileStore().delete(p),
};

/** Startup orphan-file sweep. Best effort: a failure must never block the app. */
export async function sweepLocalOrphans(deps: Deps = defaults): Promise<void> {
  try {
    const db = await deps.getDb();
    await sweepOrphanFiles(
      {
        db,
        userId: LOCAL_USER_ID,
        now: () => new Date().toISOString(),
        deleteFiles: async (paths) => void (await Promise.all(paths.map(deps.remove))),
        deleteFolder: async () => undefined,
      },
      deps.list,
    );
  } catch {
    // orphans are only wasted space
  }
}
