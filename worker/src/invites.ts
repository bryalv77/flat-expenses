import { and, eq, gt, lt, sql } from 'drizzle-orm';
import { Hono } from 'hono';

import { zRedeemInviteBody } from './generated/zod.gen';
import { invites, members, user } from './db/schema';
import { parseJson } from './http';
import { session, type AppEnv } from './middleware';

export const invitesApp = new Hono<AppEnv>();
invitesApp.use('*', session);

// Joins the invite's house as ROOMMATE (a removed member who redeems again is reactivated).
invitesApp.post('/redeem', async (c) => {
  const b = await parseJson(c, zRedeemInviteBody);
  if (!b.success) return c.json({ error: 'invalid_code' }, 400);
  const { db, uid } = c.var;
  const { code } = b.data;

  const [inv] = await db.select().from(invites).where(eq(invites.code, code));
  if (!inv) return c.json({ error: 'invalid_code' }, 404);
  const [existing] = await db.select().from(members).where(and(eq(members.houseId, inv.houseId), eq(members.userId, uid)));
  if (existing?.status === 'ACTIVE') return c.json({ error: 'already_member' }, 409); // don't burn a use

  // One conditional UPDATE claims a use atomically, so concurrent redeems can't exceed maxUses.
  const [claimed] = await db.update(invites).set({ usedCount: sql`${invites.usedCount} + 1` })
    .where(and(eq(invites.code, code), eq(invites.status, 'ACTIVE'), gt(invites.expiresAt, new Date()), lt(invites.usedCount, invites.maxUses)))
    .returning();
  if (!claimed) return c.json({ error: 'invite_unavailable' }, 410); // revoked, expired or used up

  const [u] = await db.select().from(user).where(eq(user.id, uid));
  try {
    await db.insert(members).values({
      houseId: inv.houseId, userId: uid, role: 'ROOMMATE', status: 'ACTIVE', joinedAt: new Date(),
      displayName: u?.name, email: u?.email, photoKey: u?.photoKey, inviteCode: code,
    }).onConflictDoUpdate({
      target: [members.houseId, members.userId],
      set: { status: 'ACTIVE', removedAt: null, inviteCode: code },
    });
  } catch (e) {
    await db.update(invites).set({ usedCount: sql`${invites.usedCount} - 1` }).where(eq(invites.code, code)); // give the use back
    throw e;
  }
  return c.json({ houseId: inv.houseId });
});
