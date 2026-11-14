import { newCategory, newHouse, today, uuid, useApi, type ApiFactory } from './harness';

const file = (houseId: string, billId: string, n: number) => ({
  storagePath: `houses/${houseId}/bills/${billId}/f${n}.png`,
  fileName: `f${n}.png`,
  mimeType: 'image/png',
  sizeBytes: 64,
});

export function runBillsContract(make: ApiFactory): void {
  describe('contract: bills', () => {
    const ctx = useApi(make);
    const setup = async () => {
      const houseId = await newHouse(ctx);
      return { houseId, categoryId: await newCategory(ctx, houseId) };
    };
    const ids = async (houseId: string, from: string, to: string, categoryId?: string) =>
      (await ctx.api.listBills({ houseId, from, to, categoryId })).map((b) => b.id);

    it('createBill + getBill round-trip with defaults', async () => {
      const { houseId, categoryId } = await setup();
      const id = uuid();
      await ctx.api.createBill({ houseId, id, categoryId, amountCents: 5000, chargeDate: '2026-03-15' });
      expect(await ctx.api.getBill({ houseId, id })).toMatchObject({
        id,
        categoryId,
        amountCents: 5000,
        chargeDate: '2026-03-15',
        periodStartDate: null,
        periodEndDate: null,
        files: [],
        notes: null,
        ocrStatus: 'NONE',
        ocrData: null,
      });
    });

    it('stores period dates and notes', async () => {
      const { houseId, categoryId } = await setup();
      const id = uuid();
      await ctx.api.createBill({ houseId, id, categoryId, amountCents: 1, periodStartDate: '2026-02-01', periodEndDate: '2026-02-28', notes: 'x'.repeat(1000) });
      expect(await ctx.api.getBill({ houseId, id })).toMatchObject({ amountCents: 1, periodStartDate: '2026-02-01', periodEndDate: '2026-02-28', notes: 'x'.repeat(1000) });
    });

    it('accepts the amount bounds 1 and 9,999,999', async () => {
      const { houseId, categoryId } = await setup();
      for (const amountCents of [1, 9_999_999]) {
        const id = uuid();
        await ctx.api.createBill({ houseId, id, categoryId, amountCents, chargeDate: '2026-03-01' });
        expect((await ctx.api.getBill({ houseId, id }))?.amountCents).toBe(amountCents);
      }
    });

    it.each([
      ['amount 0', { amountCents: 0 }],
      ['negative amount', { amountCents: -5 }],
      ['amount 10,000,000', { amountCents: 10_000_000 }],
      ['fractional amount', { amountCents: 10.5 }],
      ['notes over 1000 chars', { notes: 'x'.repeat(1001) }],
      ['malformed chargeDate', { chargeDate: '15/03/2026' }],
      ['malformed periodEndDate', { periodEndDate: 'tomorrow' }],
      ['unknown category', { categoryId: uuid() }],
    ])('createBill rejects %s', async (_label, over) => {
      const { houseId, categoryId } = await setup();
      const id = uuid();
      await expect(ctx.api.createBill({ houseId, id, categoryId, amountCents: 100, chargeDate: '2026-03-01', ...over })).rejects.toThrow();
      expect(await ctx.api.getBill({ houseId, id })).toBeNull();
    });

    it('createBill rejects more than 5 attachments', async () => {
      // Assumption: no real upload happens, so the "<= 5" limit is checked with 6 refs (rejected before any object lookup).
      const { houseId, categoryId } = await setup();
      const id = uuid();
      const files = [0, 1, 2, 3, 4, 5].map((n) => file(houseId, id, n));
      await expect(ctx.api.createBill({ houseId, id, categoryId, amountCents: 100, chargeDate: '2026-03-01', files })).rejects.toThrow();
      expect(await ctx.api.getBill({ houseId, id })).toBeNull();
    });

    it('getBill returns null for an unknown bill', async () => {
      const { houseId } = await setup();
      expect(await ctx.api.getBill({ houseId, id: uuid() })).toBeNull();
    });

    it('updateBill patches only the given fields', async () => {
      const { houseId, categoryId } = await setup();
      const other = await newCategory(ctx, houseId, { name: 'Otra' });
      const id = uuid();
      await ctx.api.createBill({ houseId, id, categoryId, amountCents: 100, chargeDate: '2026-03-01', notes: 'n' });
      await ctx.api.updateBill({ houseId, id, amountCents: 250, categoryId: other });
      expect(await ctx.api.getBill({ houseId, id })).toMatchObject({ amountCents: 250, categoryId: other, chargeDate: '2026-03-01', notes: 'n' });
      await ctx.api.updateBill({ houseId, id, notes: null });
      expect((await ctx.api.getBill({ houseId, id }))?.notes).toBeNull();
    });

    it('updateBill enforces the same limits', async () => {
      const { houseId, categoryId } = await setup();
      const id = uuid();
      await ctx.api.createBill({ houseId, id, categoryId, amountCents: 100, chargeDate: '2026-03-01' });
      await expect(ctx.api.updateBill({ houseId, id, amountCents: 0 })).rejects.toThrow();
      await expect(ctx.api.updateBill({ houseId, id, amountCents: 10_000_000 })).rejects.toThrow();
      await expect(ctx.api.updateBill({ houseId, id, notes: 'x'.repeat(1001) })).rejects.toThrow();
      await expect(ctx.api.updateBill({ houseId, id, categoryId: uuid() })).rejects.toThrow();
      await expect(ctx.api.updateBill({ houseId, id, files: [0, 1, 2, 3, 4, 5].map((n) => file(houseId, id, n)) })).rejects.toThrow();
      expect((await ctx.api.getBill({ houseId, id }))?.amountCents).toBe(100);
    });

    it('deleteBill removes the bill from getBill and listBills', async () => {
      const { houseId, categoryId } = await setup();
      const id = uuid();
      await ctx.api.createBill({ houseId, id, categoryId, amountCents: 100, chargeDate: '2026-03-01' });
      await ctx.api.deleteBill({ houseId, id });
      expect(await ctx.api.getBill({ houseId, id })).toBeNull();
      expect(await ids(houseId, '2026-01-01', '2026-12-31')).not.toContain(id);
    });

    it('listBills filters on the EFFECTIVE date (chargeDate, else periodEndDate, else creation day), inclusive', async () => {
      const { houseId, categoryId } = await setup();
      const add = async (extra: Record<string, string | null>) => {
        const id = uuid();
        await ctx.api.createBill({ houseId, id, categoryId, amountCents: 100, ...extra });
        return id;
      };
      const charge = await add({ chargeDate: '2026-03-10' });
      const edge = await add({ chargeDate: '2026-03-31' });
      const outside = await add({ chargeDate: '2026-04-01' });
      // charge date wins over the period end date, so this one is effective in April, not March
      const chargeBeatsPeriod = await add({ chargeDate: '2026-04-05', periodEndDate: '2026-03-20' });
      const periodOnly = await add({ periodEndDate: '2026-03-20' });
      const created = await add({});
      const march = await ids(houseId, '2026-03-01', '2026-03-31');
      expect(march).toEqual(expect.arrayContaining([charge, edge, periodOnly]));
      expect(march).not.toContain(outside);
      expect(march).not.toContain(chargeBeatsPeriod);
      expect(march).not.toContain(created);
      expect(await ids(houseId, today(), today())).toContain(created);
    });

    it('listBills is ordered by effective date descending', async () => {
      const { houseId, categoryId } = await setup();
      const byId = new Map<string, string>();
      for (const chargeDate of ['2026-03-05', '2026-03-25', '2026-03-15']) {
        const id = uuid();
        await ctx.api.createBill({ houseId, id, categoryId, amountCents: 100, chargeDate });
        byId.set(id, chargeDate);
      }
      const list = await ctx.api.listBills({ houseId, from: '2026-03-01', to: '2026-03-31' });
      expect(list.map((b) => byId.get(b.id))).toEqual(['2026-03-25', '2026-03-15', '2026-03-05']);
      // Not tested: the MAX_LIST (2000) cap, it would need 2001 bills.
    });

    it('listBills can filter by category', async () => {
      const { houseId, categoryId } = await setup();
      const other = await newCategory(ctx, houseId, { name: 'Otra' });
      const a = uuid();
      const b = uuid();
      await ctx.api.createBill({ houseId, id: a, categoryId, amountCents: 100, chargeDate: '2026-03-10' });
      await ctx.api.createBill({ houseId, id: b, categoryId: other, amountCents: 100, chargeDate: '2026-03-10' });
      expect(await ids(houseId, '2026-03-01', '2026-03-31', other)).toEqual([b]);
      expect(await ids(houseId, '2026-03-01', '2026-03-31')).toEqual(expect.arrayContaining([a, b]));
    });

    it('changing chargeDate / periodEndDate moves the effective date', async () => {
      const { houseId, categoryId } = await setup();
      const id = uuid();
      await ctx.api.createBill({ houseId, id, categoryId, amountCents: 100, chargeDate: '2026-03-10', periodEndDate: '2026-05-20' });
      expect(await ids(houseId, '2026-03-01', '2026-03-31')).toContain(id);
      await ctx.api.updateBill({ houseId, id, chargeDate: '2026-06-02' });
      expect(await ids(houseId, '2026-03-01', '2026-03-31')).not.toContain(id);
      expect(await ids(houseId, '2026-06-01', '2026-06-30')).toContain(id);
      await ctx.api.updateBill({ houseId, id, chargeDate: null });
      expect(await ids(houseId, '2026-05-01', '2026-05-31')).toContain(id);
    });

    it('bills are scoped to their house', async () => {
      const { houseId, categoryId } = await setup();
      const other = await newHouse(ctx);
      const id = uuid();
      await ctx.api.createBill({ houseId, id, categoryId, amountCents: 100, chargeDate: '2026-03-10' });
      expect(await ctx.api.getBill({ houseId: other, id })).toBeNull();
      expect(await ids(other, '2026-01-01', '2026-12-31')).toEqual([]);
    });

    // Not tested (needs a FileStore / a real R2 object): bills with files, file deletion on bill/house delete.
    // The local files-after-commit ordering is covered by the T6 unit tests with a recording FileStore.
  });
}
