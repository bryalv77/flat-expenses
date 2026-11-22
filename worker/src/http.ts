import type { Context, MiddlewareHandler } from 'hono';
import { z } from 'zod';

export const isUuid = (s: string) => z.uuid().safeParse(s).success;

export const notFound = (c: Context) => c.json({ error: 'not_found' }, 404);

/** Parses the JSON body (a missing or malformed body counts as `null`). */
export const parseJson = async <T extends z.ZodType>(c: Context, schema: T) => schema.safeParse(await c.req.json().catch(() => null));

/** Body or the 400 `{error:'invalid', issues}` response: `const b = await readBody(c, s); if (b.res) return b.res;` */
export const readBody = async <T extends z.ZodType>(c: Context, schema: T): Promise<{ data: z.infer<T>; res?: undefined } | { res: Response; data?: undefined }> => {
  const r = await parseJson(c, schema);
  return r.success ? { data: r.data } : { res: c.json({ error: 'invalid', issues: r.error.issues }, 400) };
};

/** 404 unless the named path parameter is a uuid (Postgres would throw on the cast). */
export const uuidParam = (name: string): MiddlewareHandler => async (c, next) => (isUuid(c.req.param(name) ?? '') ? next() : notFound(c));

/** The house id in `:id` (routes under /api/houses/:id are mounted, so Hono types it as optional). */
export const houseId = (c: Context) => c.req.param('id') ?? '';

export const rowOr404 = (c: Context, row: unknown) => (row ? c.json(row) : notFound(c));
export const noContentOr404 = (c: Context, rows: unknown[]) => (rows.length ? c.body(null, 204) : notFound(c));
