import { migrations } from './migrations';
import type { SqlDb } from './sql';

/** Applies pending scripts in order, all in one transaction; user_version = scripts applied. */
export async function migrate(db: SqlDb, scripts: string[] = migrations): Promise<void> {
  const row = await db.get<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  if (current >= scripts.length) return;
  await db.transaction(async () => {
    for (let i = current; i < scripts.length; i++) await db.exec(scripts[i]);
    await db.exec(`PRAGMA user_version = ${scripts.length}`);
  });
}
