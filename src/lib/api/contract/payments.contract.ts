import { guestId, newHouse, uuid, useApi, type ApiFactory } from './harness';

export function runPaymentsContract(make: ApiFactory): void {
  describe('contract: payments', () => {
    const ctx = useApi(make);
    const setup = async () => {
      const houseId = await newHouse(ctx);
      const memberId = guestId();
      await ctx.api.createGuestMember({ houseId, id: memberId, displayName: 'Bea', joinedAt: '2026-01-01', removedAt: null, individualContributionCents: null });
      return { houseId, memberId };
    };
    const list = (houseId: string, from: string, to: string) => ctx.api.listPayments({ houseId, from, to });

    it('recordPayment + listPayments round-trip', async () => {
      const { houseId, memberId } = await setup();
      const id = uuid();
      await ctx.api.recordPayment({ houseId, id, memberId, month: '2026-03-01', amountCents: 12_345, note: 'efectivo' });
      const [p] = await list(houseId, '2026-01-01', '2026-12-01');
      expect(p).toMatchObject({ id, memberId, month: '2026-03-01', amountCents: 12_345, note: 'efectivo' });
      expect(Number.isNaN(Date.parse(p!.paidAt))).toBe(false);
    });

    it('note defaults to null', async () => {
      const { houseId, memberId } = await setup();
      await ctx.api.recordPayment({ houseId, id: uuid(), memberId, month: '2026-03-01', amountCents: 100 });
      expect((await list(houseId, '2026-03-01', '2026-03-01'))[0]?.note).toBeNull();
    });

    it('accepts the amount bounds and a 200 char note', async () => {
      const { houseId, memberId } = await setup();
      await ctx.api.recordPayment({ houseId, id: uuid(), memberId, month: '2026-03-01', amountCents: 1 });
      await ctx.api.recordPayment({ houseId, id: uuid(), memberId, month: '2026-04-01', amountCents: 9_999_999, note: 'x'.repeat(200) });
      expect((await list(houseId, '2026-03-01', '2026-04-01')).map((p) => p.amountCents).sort((a, b) => a - b)).toEqual([1, 9_999_999]);
    });

    it.each([
      ['amount 0', { amountCents: 0 }],
      ['negative amount', { amountCents: -1 }],
      ['amount 10,000,000', { amountCents: 10_000_000 }],
      ['fractional amount', { amountCents: 1.5 }],
      ['note over 200 chars', { note: 'x'.repeat(201) }],
      ['month that is not the 1st', { month: '2026-03-15' }],
      ['malformed month', { month: '2026-03' }],
      ['month 13', { month: '2026-13-01' }],
      ['unknown member', { memberId: guestId() }],
    ])('recordPayment rejects %s', async (_label, over) => {
      const { houseId, memberId } = await setup();
      const id = uuid();
      await expect(ctx.api.recordPayment({ houseId, id, memberId, month: '2026-03-01', amountCents: 100, ...over })).rejects.toThrow();
      expect((await list(houseId, '2026-01-01', '2026-12-01')).map((p) => p.id)).not.toContain(id);
    });

    it('a REMOVED member can still be credited a back payment', async () => {
      const { houseId, memberId } = await setup();
      await ctx.api.removeMember({ houseId, memberId, removedAt: '2026-02-28' });
      const id = uuid();
      await ctx.api.recordPayment({ houseId, id, memberId, month: '2026-02-01', amountCents: 500 });
      expect((await list(houseId, '2026-02-01', '2026-02-01')).map((p) => p.id)).toEqual([id]);
    });

    it('listPayments filters by an inclusive month range, newest month first', async () => {
      const { houseId, memberId } = await setup();
      const byId = new Map<string, string>();
      for (const month of ['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01']) {
        const id = uuid();
        await ctx.api.recordPayment({ houseId, id, memberId, month, amountCents: 100 });
        byId.set(id, month);
      }
      const got = await list(houseId, '2026-02-01', '2026-03-01');
      expect(got.map((p) => byId.get(p.id))).toEqual(['2026-03-01', '2026-02-01']);
      expect(await list(houseId, '2027-01-01', '2027-12-01')).toEqual([]);
      expect(await list(houseId, '2026-01-01', '2026-04-01')).toHaveLength(4);
    });

    it('deletePayment removes only that payment', async () => {
      const { houseId, memberId } = await setup();
      const a = uuid();
      const b = uuid();
      await ctx.api.recordPayment({ houseId, id: a, memberId, month: '2026-03-01', amountCents: 100 });
      await ctx.api.recordPayment({ houseId, id: b, memberId, month: '2026-03-01', amountCents: 200 });
      await ctx.api.deletePayment({ houseId, id: a });
      expect((await list(houseId, '2026-03-01', '2026-03-01')).map((p) => p.id)).toEqual([b]);
    });

    it('payments are scoped to their house', async () => {
      const { houseId, memberId } = await setup();
      const other = await newHouse(ctx);
      await ctx.api.recordPayment({ houseId, id: uuid(), memberId, month: '2026-03-01', amountCents: 100 });
      expect(await list(other, '2026-01-01', '2026-12-01')).toEqual([]);
      // DIVERGENCE (not tested): recordedBy is stored by every backend but is not part of the MemberPayment type.
    });
  });
}
