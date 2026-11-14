import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import type { TestProject } from 'vitest/node';

// Route tests need a real Postgres. Admin URL defaults to the local Homebrew one (see README); override with TEST_ADMIN_URL.
const admin = process.env.TEST_ADMIN_URL ?? 'postgres://localhost:5432/postgres';
const testUrl = new URL(admin);
testUrl.pathname = '/costos_piso_test';

export default async function setup(project: TestProject) {
  // TEST_DATABASE_URL: run the suite against an existing database (e.g. a Neon branch, which also exercises the Neon HTTP driver).
  if (process.env.TEST_DATABASE_URL) {
    const db = drizzle(process.env.TEST_DATABASE_URL);
    await migrate(db, { migrationsFolder: './migrations' });
    await db.$client.end();
    project.provide('testDbUrl', process.env.TEST_DATABASE_URL);
    return;
  }
  const client = new pg.Client({ connectionString: admin });
  try {
    await client.connect();
    const { rowCount } = await client.query("select 1 from pg_database where datname = 'costos_piso_test'");
    if (!rowCount) await client.query('create database costos_piso_test');
  } catch {
    project.provide('testDbUrl', null); // no Postgres: the DB suites skip themselves
    return;
  } finally {
    await client.end().catch(() => undefined);
  }
  const db = drizzle(testUrl.toString());
  await migrate(db, { migrationsFolder: './migrations' });
  await db.$client.end();
  project.provide('testDbUrl', testUrl.toString());
}

declare module 'vitest' {
  export interface ProvidedContext {
    testDbUrl: string | null;
  }
}
