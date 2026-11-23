import { guestId, newCategory, newHouse, uuid, useApi, type ApiFactory } from './harness';

export function runHousesContract(make: ApiFactory): void {
  describe('contract: user, houses, members', () => {
    const ctx = useApi(make);

    describe('user', () => {
      it('upsertUser + getMe round-trip the editable profile', async () => {
        await ctx.api.upsertUser({ email: 'ana@test.dev', displayName: 'Ana', locale: 'en', accountRole: 'ADMIN' });
        const me = await ctx.api.getMe();
        expect(me).toMatchObject({ displayName: 'Ana', locale: 'en', accountRole: 'ADMIN', photoPath: null });
        expect(typeof me?.id).toBe('string');
        // DIVERGENCE: `email` is owned by Better Auth on the Worker, so it is not asserted.
      });

      it('updateMyProfile changes only the given fields', async () => {
        await ctx.api.upsertUser({ email: 'ana@test.dev', displayName: 'Ana', locale: 'en', accountRole: 'ADMIN' });
        await ctx.api.updateMyProfile({ displayName: 'Ana B' });
        expect(await ctx.api.getMe()).toMatchObject({ displayName: 'Ana B', locale: 'en', accountRole: 'ADMIN' });
        await ctx.api.updateMyProfile({ locale: 'fr', accountRole: 'ROOMMATE' });
        expect(await ctx.api.getMe()).toMatchObject({ displayName: 'Ana B', locale: 'fr', accountRole: 'ROOMMATE' });
      });

      it('updateMyProfile keeps the denormalised member copy in sync', async () => {
        const houseId = await newHouse(ctx);
        await ctx.api.updateMyProfile({ displayName: 'Renamed' });
        const me = await ctx.api.getMe();
        expect((await ctx.api.listMembers({ houseId })).find((m) => m.id === me!.id)?.displayName).toBe('Renamed');
      });

      it('rejects an empty or too long displayName and an unknown account role', async () => {
        await expect(ctx.api.updateMyProfile({ displayName: '' })).rejects.toThrow();
        await expect(ctx.api.updateMyProfile({ displayName: 'x'.repeat(101) })).rejects.toThrow();
        await expect(ctx.api.updateMyProfile({ accountRole: 'OWNER' as never })).rejects.toThrow();
      });

      // DIVERGENCE (not tested): listMyDocuments/addMyDocument/deleteMyDocument need a real uploaded object on the Worker and
      // are dropped in local mode; deleteMyAccountData throws USE_AUTH_DELETE_USER on the Worker (account deletion goes through Better Auth).
      it('listMemberDocuments is always empty for admins', async () => {
        const houseId = await newHouse(ctx);
        const me = await ctx.api.getMe();
        expect(await ctx.api.listMemberDocuments({ houseId, userId: me!.id })).toEqual([]);
      });
    });

    describe('houses', () => {
      it('createHouse yields the house and an ADMIN member for the creator', async () => {
        const me = (await ctx.api.getMe())!;
        const houseId = await newHouse(ctx, { name: 'Mi piso', address: 'Calle 1' });
        const got = await ctx.api.getHouse({ houseId });
        expect(got?.house).toMatchObject({
          id: houseId,
          name: 'Mi piso',
          address: 'Calle 1',
          currency: 'EUR',
          splitMode: 'EQUAL',
          fixedContributionCents: null,
          contributionDayOfMonth: null,
          showBalanceToRoommates: true,
        });
        expect(got?.members).toEqual([expect.objectContaining({ id: me.id, userId: me.id, role: 'ADMIN', status: 'ACTIVE', removedAt: null })]);
        expect(await ctx.api.listMyHouses()).toEqual(expect.arrayContaining([expect.objectContaining({ id: houseId, role: 'ADMIN' })]));
        // DIVERGENCE: the suggested categories are seeded by the app (seedSuggestedCategories) on the Worker,
        // while local createHouse is meant to seed them itself; the count is not asserted (categories.contract.ts is count-agnostic).
      });

      it('createHouse stores the optional settings', async () => {
        const houseId = await newHouse(ctx, { splitMode: 'FIXED_CONTRIBUTION', fixedContributionCents: 5000, contributionDayOfMonth: 15, showBalanceToRoommates: false });
        expect((await ctx.api.getHouse({ houseId }))?.house).toMatchObject({
          splitMode: 'FIXED_CONTRIBUTION',
          fixedContributionCents: 5000,
          contributionDayOfMonth: 15,
          showBalanceToRoommates: false,
        });
      });

      it('getHouse returns null for an unknown house', async () => {
        expect(await ctx.api.getHouse({ houseId: uuid() })).toBeNull();
      });

      it('updateHouse patches only the given fields', async () => {
        const houseId = await newHouse(ctx, { name: 'Antes', address: 'Calle 1' });
        await ctx.api.updateHouse({ houseId, name: 'Despues', contributionDayOfMonth: 5 });
        expect((await ctx.api.getHouse({ houseId }))?.house).toMatchObject({ name: 'Despues', address: 'Calle 1', contributionDayOfMonth: 5 });
        await ctx.api.updateHouse({ houseId, address: null });
        expect((await ctx.api.getHouse({ houseId }))?.house.address).toBeNull();
      });

      it('rejects invalid house fields', async () => {
        await expect(ctx.api.createHouse({ id: uuid(), name: '' })).rejects.toThrow();
        await expect(ctx.api.createHouse({ id: uuid(), name: 'x'.repeat(101) })).rejects.toThrow();
        await expect(ctx.api.createHouse({ id: uuid(), name: 'Piso', address: 'x'.repeat(201) })).rejects.toThrow();
        await expect(ctx.api.createHouse({ id: uuid(), name: 'Piso', contributionDayOfMonth: 0 })).rejects.toThrow();
        await expect(ctx.api.createHouse({ id: uuid(), name: 'Piso', contributionDayOfMonth: 32 })).rejects.toThrow();
        await expect(ctx.api.createHouse({ id: uuid(), name: 'Piso', fixedContributionCents: -1 })).rejects.toThrow();
        const houseId = await newHouse(ctx);
        await expect(ctx.api.updateHouse({ houseId, name: '' })).rejects.toThrow();
        await expect(ctx.api.updateHouse({ houseId, contributionDayOfMonth: 32 })).rejects.toThrow();
      });

      it('deleteHouse removes the house and cascades to its categories, bills, payments and members', async () => {
        const houseId = await newHouse(ctx);
        const categoryId = await newCategory(ctx, houseId);
        await ctx.api.createBill({ houseId, id: uuid(), categoryId, amountCents: 1000, chargeDate: '2026-03-01' });
        const guest = guestId();
        await ctx.api.createGuestMember({ houseId, id: guest, displayName: 'Bea', joinedAt: '2026-01-01', removedAt: null, individualContributionCents: null });
        await ctx.api.recordPayment({ houseId, id: uuid(), memberId: guest, month: '2026-03-01', amountCents: 500 });
        await ctx.api.deleteHouse({ houseId });
        expect(await ctx.api.getHouse({ houseId })).toBeNull();
        expect((await ctx.api.listMyHouses()).map((h) => h.id)).not.toContain(houseId);
        // Children are not observable once the house is gone; the local SQLite unit tests (T2) cover the FK cascade.
      });
    });

    describe('members', () => {
      it('createGuestMember registers a guest_ roommate without an account', async () => {
        const houseId = await newHouse(ctx);
        const id = guestId();
        await ctx.api.createGuestMember({ houseId, id, displayName: 'Bea', joinedAt: '2026-01-01', removedAt: null, individualContributionCents: 1234 });
        const guest = (await ctx.api.listMembers({ houseId })).find((m) => m.id === id);
        expect(guest).toMatchObject({ id, userId: id, displayName: 'Bea', role: 'ROOMMATE', status: 'ACTIVE', removedAt: null, individualContributionCents: 1234, email: '', photoPath: null });
        expect(guest?.joinedAt).toBe('2026-01-01T12:00:00.000Z');
      });

      it('a guest created with a removedAt is REMOVED', async () => {
        const houseId = await newHouse(ctx);
        const id = guestId();
        await ctx.api.createGuestMember({ houseId, id, displayName: 'Old', joinedAt: '2025-01-01', removedAt: '2025-06-30', individualContributionCents: null });
        expect((await ctx.api.listMembers({ houseId })).find((m) => m.id === id)).toMatchObject({ status: 'REMOVED', removedAt: '2025-06-30T12:00:00.000Z' });
      });

      it('rejects a guest without the guest_ prefix or with an empty or too long name', async () => {
        const houseId = await newHouse(ctx);
        const base = { houseId, joinedAt: '2026-01-01', removedAt: null, individualContributionCents: null };
        // DIVERGENCE: the id pattern is [A-Za-z0-9]{12,40} in the rules and 32 hex chars in the Worker; guestId() satisfies both.
        await expect(ctx.api.createGuestMember({ ...base, id: 'plain_' + uuid(), displayName: 'Bea' })).rejects.toThrow();
        await expect(ctx.api.createGuestMember({ ...base, id: guestId(), displayName: '' })).rejects.toThrow();
        await expect(ctx.api.createGuestMember({ ...base, id: guestId(), displayName: 'x'.repeat(101) })).rejects.toThrow();
      });

      it('removeMember sets REMOVED and the given removedAt day; reactivateMember clears it', async () => {
        const houseId = await newHouse(ctx);
        const id = guestId();
        await ctx.api.createGuestMember({ houseId, id, displayName: 'Bea', joinedAt: '2026-01-01', removedAt: null, individualContributionCents: null });
        await ctx.api.removeMember({ houseId, memberId: id, removedAt: '2026-06-30' });
        expect((await ctx.api.listMembers({ houseId })).find((m) => m.id === id)).toMatchObject({ status: 'REMOVED', removedAt: '2026-06-30T12:00:00.000Z' });
        await ctx.api.reactivateMember({ houseId, memberId: id });
        expect((await ctx.api.listMembers({ houseId })).find((m) => m.id === id)).toMatchObject({ status: 'ACTIVE', removedAt: null });
      });

      it('removeMember without a date defaults to now', async () => {
        const houseId = await newHouse(ctx);
        const id = guestId();
        await ctx.api.createGuestMember({ houseId, id, displayName: 'Bea', joinedAt: '2026-01-01', removedAt: null, individualContributionCents: null });
        await ctx.api.removeMember({ houseId, memberId: id });
        const m = (await ctx.api.listMembers({ houseId })).find((x) => x.id === id);
        expect(m?.status).toBe('REMOVED');
        expect(Math.abs(Date.now() - new Date(m!.removedAt!).getTime())).toBeLessThan(5 * 60_000);
      });

      it('an ADMIN cannot be removed, so the house always keeps an ADMIN', async () => {
        const houseId = await newHouse(ctx);
        const me = (await ctx.api.getMe())!;
        // DIVERGENCE: the local backend rejects removing an ADMIN; the Worker's /remove route does not. Asserted only when the
        // backend declares `adminProtected` (the local one must).
        if (!ctx.adminProtected) return;
        await expect(ctx.api.removeMember({ houseId, memberId: me.id })).rejects.toThrow();
        const admins = (await ctx.api.listMembers({ houseId })).filter((m) => m.role === 'ADMIN' && m.status === 'ACTIVE');
        expect(admins).toHaveLength(1);
      });

      it('the last ADMIN cannot leave the house', async () => {
        const houseId = await newHouse(ctx);
        await expect(ctx.api.leaveHouse({ houseId })).rejects.toThrow();
        expect((await ctx.api.listMyHouses()).map((h) => h.id)).toContain(houseId);
      });

      it('setMemberContribution sets and clears the amount', async () => {
        const houseId = await newHouse(ctx);
        const id = guestId();
        await ctx.api.createGuestMember({ houseId, id, displayName: 'Bea', joinedAt: '2026-01-01', removedAt: null, individualContributionCents: null });
        await ctx.api.setMemberContribution({ houseId, memberId: id, individualContributionCents: 4200 });
        expect((await ctx.api.listMembers({ houseId })).find((m) => m.id === id)?.individualContributionCents).toBe(4200);
        await ctx.api.setMemberContribution({ houseId, memberId: id, individualContributionCents: null });
        expect((await ctx.api.listMembers({ houseId })).find((m) => m.id === id)?.individualContributionCents).toBeNull();
        await expect(ctx.api.setMemberContribution({ houseId, memberId: id, individualContributionCents: -1 })).rejects.toThrow();
      });

      it('listMembers is ordered by joinedAt ascending and matches getHouse().members', async () => {
        const houseId = await newHouse(ctx);
        const early = guestId();
        await ctx.api.createGuestMember({ houseId, id: early, displayName: 'Early', joinedAt: '2000-01-01', removedAt: null, individualContributionCents: null });
        const members = await ctx.api.listMembers({ houseId });
        expect(members[0]?.id).toBe(early);
        expect(members).toHaveLength(2);
        expect((await ctx.api.getHouse({ houseId }))?.members.map((m) => m.id)).toEqual(members.map((m) => m.id));
      });

      // DIVERGENCE (not tested): createInvite, revokeInvite, listInvites, redeemInvite exist on the Worker but
      // local mode has no invites (single device); they cannot be shared. A second signed-in user would be needed anyway.
    });
  });
}
