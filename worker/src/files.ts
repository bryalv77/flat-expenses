import { Hono } from 'hono';

import { FILE_RULES, parseFileKey, type FileKind } from '../../src/lib/fileKeys';
import type { Db } from './db/client';
import { zSignFileUrlBody } from './generated/zod.gen';
import { isUuid, parseJson } from './http';
import { membership, session, type AppEnv } from './middleware';

// File storage on R2, uploaded through the Worker (issue #7 §6, v1). Key layout lives in src/lib/fileKeys.ts:
//   users/{uid}/avatar/{file}                 read: any signed-in user · write: owner · image < 2 MB
//   users/{uid}/documents/{docId}/{file}      owner only · image or PDF < 10 MB
//   houses/{houseId}/bills/{folder}/{file}    read: active members · write: active admins · image or PDF < 10 MB


/** Best-effort cleanup: a failed delete leaves an orphan object, never a broken request. */
export const deleteObjects = async (bucket: R2Bucket, keys: string[]) => {
  for (let i = 0; i < keys.length; i += 1000) await bucket.delete(keys.slice(i, i + 1000)).catch(() => undefined);
};

/** Deletes every object under a prefix (house deletion). */
export const purgePrefix = async (bucket: R2Bucket, prefix: string) => {
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, cursor });
    await deleteObjects(bucket, page.objects.map((o) => o.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
};

const roleIn = async (db: Db, houseId: string, uid: string) => {
  if (!isUuid(houseId)) return null;
  return (await membership(db, houseId, uid))?.role ?? null;
};

/** null = allowed. Unknown houses/non-members get 404 so existence isn't revealed; wrong owner or role gets 403. */
const denied = async (db: Db, uid: string, p: { kind: FileKind; owner: string }, write: boolean): Promise<404 | 403 | null> => {
  if (p.kind === 'avatar' && !write) return null;
  if (p.kind !== 'bill') return p.owner === uid ? null : 403;
  const role = await roleIn(db, p.owner, uid);
  if (!role) return 404;
  return write && role !== 'ADMIN' ? 403 : null;
};

export const filesApp = new Hono<AppEnv>();

// <Image> and Linking can't send an Authorization header, so reads also accept a short-lived signed link
// (POST /api/files/sign, which does the real authorization; valid 1 h). Everything else needs a session.
filesApp.use('*', (c, next) => (c.req.method === 'GET' && c.req.query('sig') ? next() : session(c, next)));

const SIGN_TTL_S = 3600; // the app caches resolved URLs for 50 min (useFileUrl)
const hmacKey = (secret: string, usage: 'sign' | 'verify') =>
  crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const unhex = (h: string) => Uint8Array.from(h.match(/../g) ?? [], (x) => parseInt(x, 16));
const payload = (key: string, exp: number) => new TextEncoder().encode(`file:${key}:${exp}`);

filesApp.post('/sign', async (c) => {
  const b = await parseJson(c, zSignFileUrlBody);
  const p = b.success ? parseFileKey(b.data.key) : null;
  if (!b.success || !p) return c.json({ error: 'invalid_key' }, 400);
  const deny = await denied(c.var.db, c.var.uid, p, false);
  if (deny) return c.json({ error: deny === 404 ? 'not_found' : 'forbidden' }, deny);
  const exp = Math.floor(Date.now() / 1000) + SIGN_TTL_S;
  const sig = hex(await crypto.subtle.sign('HMAC', await hmacKey(c.env.BETTER_AUTH_SECRET, 'sign'), payload(b.data.key, exp)));
  return c.json({ url: `${new URL(c.req.url).origin}/api/files/${b.data.key}?exp=${exp}&sig=${sig}`, expiresAt: exp * 1000 });
});

const validSignature = async (secret: string, key: string, exp: number, sig: string) =>
  Number.isFinite(exp) && exp * 1000 > Date.now() && /^[0-9a-f]{64}$/.test(sig) &&
  crypto.subtle.verify('HMAC', await hmacKey(secret, 'verify'), unhex(sig), payload(key, exp)); // verify() compares in constant time

// Key = everything after /api/files/ (it contains slashes).
const keyOf = (path: string) => decodeURIComponent(path.replace(/^\/api\/files\//, ''));

filesApp.put('/*', async (c) => {
  const key = keyOf(c.req.path);
  const p = parseFileKey(key);
  if (!p) return c.json({ error: 'invalid_key' }, 400);
  const deny = await denied(c.var.db, c.var.uid, p, true);
  if (deny) return c.json({ error: deny === 404 ? 'not_found' : 'forbidden' }, deny);

  const mime = (c.req.header('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  const { maxBytes: max, mimeTypes } = FILE_RULES[p.kind];
  if (!mimeTypes.includes(mime)) return c.json({ error: 'unsupported_type' }, 415);
  if (Number(c.req.header('content-length') ?? 0) > max) return c.json({ error: 'too_large' }, 413); // before buffering
  const body = await c.req.arrayBuffer();
  if (body.byteLength === 0) return c.json({ error: 'empty' }, 400);
  if (body.byteLength > max) return c.json({ error: 'too_large' }, 413);

  await c.env.BUCKET.put(key, body, { httpMetadata: { contentType: mime } });
  return c.json({ key, mimeType: mime, sizeBytes: body.byteLength }, 201);
});

filesApp.get('/*', async (c) => {
  const key = keyOf(c.req.path);
  const p = parseFileKey(key);
  if (!p) return c.json({ error: 'invalid_key' }, 400);
  const sig = c.req.query('sig');
  if (sig) {
    if (!(await validSignature(c.env.BETTER_AUTH_SECRET, key, Number(c.req.query('exp')), sig))) return c.json({ error: 'forbidden' }, 403);
  } else {
    const deny = await denied(c.var.db, c.var.uid, p, false);
    if (deny) return c.json({ error: deny === 404 ? 'not_found' : 'forbidden' }, deny);
  }
  const obj = await c.env.BUCKET.get(key);
  if (!obj) return c.json({ error: 'not_found' }, 404);
  return new Response(obj.body, {
    headers: {
      'content-type': obj.httpMetadata?.contentType ?? 'application/octet-stream',
      'content-length': String(obj.size),
      'cache-control': 'private, max-age=300',
      'x-content-type-options': 'nosniff', // never let a browser sniff an upload into HTML
    },
  });
});

filesApp.delete('/*', async (c) => {
  const key = keyOf(c.req.path);
  const p = parseFileKey(key);
  if (!p) return c.json({ error: 'invalid_key' }, 400);
  const deny = await denied(c.var.db, c.var.uid, p, true);
  if (deny) return c.json({ error: deny === 404 ? 'not_found' : 'forbidden' }, deny);
  await c.env.BUCKET.delete(key);
  return c.body(null, 204);
});
