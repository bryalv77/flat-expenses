import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';

import * as schema from './schema';

// Plain substring check: Neon hosts are always *.neon.tech.
const isLocal = (url: string) => !url.includes('.neon.tech');

/**
 * One client per request (Workers have no long-lived connections). Neon in production (HTTP driver);
 * a plain `pg` connection for a local Postgres (`pnpm dev:local`). Both expose the same query API.
 */
export const createDb = (databaseUrl: string) =>
  (isLocal(databaseUrl) ? localDb(databaseUrl) : drizzle(neon(databaseUrl), { schema })) as ReturnType<typeof drizzle<typeof schema>>;

// Workers can't share a socket across requests, so there it is one pool per request (idles out on its own).
// Plain Node (vitest) would pile up hundreds of pools, so reuse one per URL there.
const inWorkers = typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers';
const shared = new Map<string, ReturnType<typeof drizzlePg<typeof schema>>>();
const localDb = (url: string) => {
  if (inWorkers) return drizzlePg(url, { schema });
  if (!shared.has(url)) shared.set(url, drizzlePg(url, { schema }));
  return shared.get(url)!;
};
export type Db = ReturnType<typeof createDb>;
