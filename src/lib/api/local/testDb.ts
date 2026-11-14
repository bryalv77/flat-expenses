// Test-only SqlDb over better-sqlite3 (in-memory). Never import from app code.
import Database from 'better-sqlite3';
import type { SqlDb, SqlParam } from './sql';

export function createTestDb(): SqlDb {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  return {
    all: async <T>(sql: string, params: SqlParam[] = []) => db.prepare(sql).all(...params) as T[],
    get: async <T>(sql: string, params: SqlParam[] = []) =>
      db.prepare(sql).get(...params) as T | undefined,
    run: async (sql, params = []) => ({ changes: db.prepare(sql).run(...params).changes }),
    exec: async (sql) => {
      db.exec(sql);
    },
    async transaction<T>(fn: () => Promise<T>) {
      db.exec('BEGIN');
      try {
        const result = await fn();
        db.exec('COMMIT');
        return result;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
}
