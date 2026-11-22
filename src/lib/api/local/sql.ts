/** Async SQL port. Native/web use expo-sqlite (sql.expo.ts); Jest uses better-sqlite3 (testDb.ts). */
export type SqlParam = string | number | null | Uint8Array;

export interface SqlDb {
  all<T>(sql: string, params?: SqlParam[]): Promise<T[]>;
  get<T>(sql: string, params?: SqlParam[]): Promise<T | undefined>;
  run(sql: string, params?: SqlParam[]): Promise<{ changes: number }>;
  /** Runs one or more statements without parameters. */
  exec(sql: string): Promise<void>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}
