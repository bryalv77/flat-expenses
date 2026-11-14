import type { SqlDb } from './sql';

/** What every local domain module receives. `deleteFiles` runs AFTER the DB commit (files are not transactional). */
export interface LocalCtx {
  db: SqlDb;
  userId: string; // always 'local' in the app; tests may vary it
  now: () => string; // ISO-8601 UTC
  deleteFiles: (paths: string[]) => Promise<void>;
  deleteFolder: (prefix: string) => Promise<void>;
}

export const LOCAL_USER_ID = 'local';
