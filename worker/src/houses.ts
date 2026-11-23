import { and, asc, desc, eq } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import { z } from 'zod';

import { billsApp } from './bills';
import { categoriesApp } from './categories';
import { paymentsApp } from './payments';
import { houses, invites, members } from './db/schema';
import { purgePrefix } from './files';
import { GUEST_ID, INVITE_ALPHABET, INVITE_CODE, INVITE_CODE_LENGTH, MAX_MEMBERS_LIST, newGuestId } from './config';
import { houseId, parseJson, readBody, rowOr404 } from './http';
import { guardAdmin, guardMember, session, type AppEnv } from './middleware';

export const housesApp = new Hono<AppEnv>();
housesApp.use('*', session);

const houseFields = {
  name: z.string().trim().min(1).max(100),
  address: z.string().trim().max(200).nullish(),
  splitMode: z.string().min(1).max(30).optional(),
  fixedContributionCents: z.number().int().min(0).nullish(),
  contributionDayOfMonth: z.number().int().min(1).max(31).nullish(),
  showBalanceToRoommates: z.boolean().optional(),
};
const createSchema = z.object({ id: z.uuid().optional(), ...houseFields }); // the app generates ids for optimistic updates
const updateSchema = z.object(houseFields).partial().strict();

housesApp.get('/', async (c) => {
  const rows = await c.var.db
    .select({ house: houses, role: members.role })
    .from(members)
    .innerJoin(houses, eq(houses.id, members.houseId))
    .where(and(eq(members.userId, c.var.uid), eq(members.status, 'ACTIVE')));
  return c.json(rows.map((r) => ({ ...r.house, role: r.role })));
});

housesApp.post('/', async (c) => {
  const body = await readBody(c, createSchema);
  if (body.res) return body.res;
  const v = body.data;
  const { db, uid } = c.var;
  const ud = await db.query.user.findFirst({ where: (u, { eq }) => eq(u.id, uid) });
  const id = v.id ?? crypto.randomUUID();
  // No interactive transactions on neon-http, so compensate: if the membership insert fails, drop the house.
  const [house] = await db.insert(houses).values({ ...v, id, splitMode: v.splitMode ?? 'EQUAL', createdBy: uid }).returning();
  try {
    await db.insert(members).values({
      houseId: id, userId: uid, role: 'ADMIN', status: 'ACTIVE', joinedAt: new Date(),
      displayName: ud?.name, email: ud?.email, photoKey: ud?.photoKey,
    });
  } catch (e) {
    await db.delete(houses).where(eq(houses.id, id));
    throw e;
  }
  return c.json(house, 201);
});

housesApp.get('/:id', guardMember, async (c) => {
  const id = houseId(c);
  const [house] = await c.var.db.select().from(houses).where(eq(houses.id, id));
  const list = await c.var.db.select().from(members).where(eq(members.houseId, id)).orderBy(asc(members.joinedAt)).limit(MAX_MEMBERS_LIST);
  return c.json({ house, members: list });
});

housesApp.patch('/:id', guardAdmin, async (c) => {
  const body = await readBody(c, updateSchema);
  if (body.res) return body.res;
  const [house] = await c.var.db.update(houses).set(body.data).where(eq(houses.id, houseId(c))).returning();
  return c.json(house);
});

// Members, categories, bills and payments cascade in Postgres; the house's R2 objects are purged afterwards.
housesApp.delete('/:id', guardAdmin, async (c) => {
  await c.var.db.delete(houses).where(eq(houses.id, houseId(c)));
  await purgePrefix(c.env.BUCKET, `houses/${houseId(c)}/`);
  return c.body(null, 204);
});

const day = z.iso.date().transform((d) => new Date(`${d}T12:00:00Z`)); // noon UTC, so the stored date never shifts a day with the time zone
const cents = z.number().int().min(0).nullable();

const target = (c: Context) =>
  and(eq(members.houseId, houseId(c)), eq(members.userId, c.req.param('memberId') ?? ''));

housesApp.get('/:id/members', guardMember, async (c) =>
  c.json(await c.var.db.select().from(members).where(eq(members.houseId, houseId(c))).orderBy(asc(members.joinedAt)).limit(MAX_MEMBERS_LIST)),
);

// Admin registers a roommate without an account (id guest_…); dates may be historical.
housesApp.post('/:id/members/guests', guardAdmin, async (c) => {
  const b = await readBody(c, z.object({
    id: z.string().regex(GUEST_ID).optional(), // client-generated
    displayName: z.string().trim().min(1).max(100),
    joinedAt: day,
    removedAt: day.nullable(),
    individualContributionCents: cents,
  }));
  if (b.res) return b.res;
  const [m] = await c.var.db.insert(members).values({
    houseId: houseId(c), userId: b.data.id ?? newGuestId(crypto.randomUUID()), role: 'ROOMMATE',
    status: b.data.removedAt ? 'REMOVED' : 'ACTIVE', joinedAt: b.data.joinedAt, removedAt: b.data.removedAt,
    individualContributionCents: b.data.individualContributionCents, displayName: b.data.displayName, email: '',
  }).returning();
  return c.json(m, 201);
});

// Admin removes a roommate; `removedAt` is the day they left (default: now).
housesApp.post('/:id/members/:memberId/remove', guardAdmin, async (c) => {
  const b = await readBody(c, z.object({ removedAt: day.optional() }));
  if (b.res) return b.res;
  const [m] = await c.var.db.update(members).set({ status: 'REMOVED', removedAt: b.data.removedAt ?? new Date() }).where(target(c)).returning();
  return rowOr404(c, m);
});

housesApp.post('/:id/members/:memberId/reactivate', guardAdmin, async (c) => {
  const [m] = await c.var.db.update(members).set({ status: 'ACTIVE', removedAt: null }).where(target(c)).returning();
  return rowOr404(c, m);
});

housesApp.patch('/:id/members/:memberId', guardAdmin, async (c) => {
  const b = await readBody(c, z.object({ individualContributionCents: cents }));
  if (b.res) return b.res;
  const [m] = await c.var.db.update(members).set(b.data).where(target(c)).returning();
  return rowOr404(c, m);
});

housesApp.post('/:id/leave', guardMember, async (c) => {
  const { db, uid } = c.var;
  const hid = houseId(c);
  // The last admin can't leave: the house would be orphaned (delete it or hand over first).
  const admins = await db.select().from(members).where(and(eq(members.houseId, hid), eq(members.role, 'ADMIN'), eq(members.status, 'ACTIVE')));
  if (admins.length === 1 && admins[0]!.userId === uid) return c.json({ error: 'last_admin' }, 409);
  await db.update(members).set({ status: 'REMOVED', removedAt: new Date() }).where(and(eq(members.houseId, hid), eq(members.userId, uid)));
  return c.body(null, 204);
});

// Invites (admin side; redeeming lives in invites.ts)
const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(INVITE_CODE_LENGTH)), (b) => INVITE_ALPHABET[b % INVITE_ALPHABET.length]).join('');

housesApp.get('/:id/invites', guardAdmin, async (c) => {
  const rows = await c.var.db.select().from(invites).where(eq(invites.houseId, houseId(c))).orderBy(desc(invites.createdAt)).limit(50);
  const now = new Date();
  return c.json(rows.map((r) => ({ ...r, status: r.status === 'ACTIVE' && r.expiresAt < now ? 'EXPIRED' : r.status })));
});

housesApp.post('/:id/invites', guardAdmin, async (c) => {
  const b = await parseJson(c, z.object({ code: z.string().regex(INVITE_CODE).optional(), expiresAt: z.iso.datetime().transform((d) => new Date(d)), maxUses: z.number().int().min(1).max(100) }));
  if (!b.success || b.data.expiresAt <= new Date()) return c.json({ error: 'invalid' }, 400);
  const { code = newCode(), ...rest } = b.data;
  const [inv] = await c.var.db.insert(invites).values({ code, houseId: houseId(c), status: 'ACTIVE', createdBy: c.var.uid, ...rest })
    .onConflictDoNothing().returning();
  return inv ? c.json(inv, 201) : c.json({ error: 'code_taken' }, 409); // a client-chosen code can collide; the app retries
});

housesApp.post('/:id/invites/:code/revoke', guardAdmin, async (c) => {
  const [inv] = await c.var.db.update(invites).set({ status: 'REVOKED' })
    .where(and(eq(invites.houseId, houseId(c)), eq(invites.code, c.req.param('code')))).returning();
  return rowOr404(c, inv);
});

housesApp.route('/:id/categories', categoriesApp);
housesApp.route('/:id/bills', billsApp);
housesApp.route('/:id/payments', paymentsApp);
