import { openDatabaseAsync, type SQLiteBindParams, type SQLiteDatabase } from 'expo-sqlite';
import { migrate } from './migrate';
import type { SqlDb } from './sql';

export function fromExpoDb(db: SQLiteDatabase): SqlDb {
  return {
    all: <T>(sql: string, params: SQLiteBindParams = []) => db.getAllAsync<T>(sql, params),
    get: async <T>(sql: string, params: SQLiteBindParams = []) =>
      (await db.getFirstAsync<T>(sql, params)) ?? undefined,
    run: async (sql, params = []) => ({ changes: (await db.runAsync(sql, params)).changes }),
    exec: (sql) => db.execAsync(sql),
    // shortcut: non-exclusive transaction, other async calls can interleave; fine for a single-user app.
    async transaction<T>(fn: () => Promise<T>) {
      let result!: T;
      await db.withTransactionAsync(async () => {
        result = await fn();
      });
      return result;
    },
  };
}

/** Opens the app database, enables foreign keys and runs pending migrations. */
export async function openLocalDb(name = 'costos-local.db'): Promise<SqlDb> {
  const raw = await openDatabaseAsync(name);
  await raw.execAsync('PRAGMA foreign_keys = ON');
  const db = fromExpoDb(raw);
  await migrate(db);
  return db;
}

let shared: Promise<SqlDb> | undefined;
/** The one app-wide connection: the api, the web file store and backup must share it (OPFS allows a single writer). */
export function getLocalDb(): Promise<SqlDb> {
  shared ??= openLocalDb();
  return shared;
}
