import type { ApiFactory } from '../contract/harness';
import { createLocalApi } from './index';
import { migrate } from './migrate';
import { createTestDb } from './testDb';

/** Fresh in-memory SQLite per test, for the contract suites. */
export const makeLocalTestApi: ApiFactory = async () => {
  const db = createTestDb();
  await migrate(db);
  return { api: createLocalApi(db), cleanup: async () => undefined, adminProtected: true };
};
