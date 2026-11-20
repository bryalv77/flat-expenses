import { categoryInput, newCategory, newHouse, uuid, useApi, type ApiFactory } from './harness';

export function runCategoriesContract(make: ApiFactory): void {
  describe('contract: categories', () => {
    const ctx = useApi(make);
    // The house may already hold seeded suggestions (local seeds on createHouse), so tests look categories up by id.
    const find = async (houseId: string, id: string) => (await ctx.api.listCategories({ houseId })).find((c) => c.id === id);

    it('createCategory applies the defaults and listCategories returns it', async () => {
      const houseId = await newHouse(ctx);
      const id = await newCategory(ctx, houseId, { name: 'Luz propia' });
      expect(await find(houseId, id)).toEqual({
        id,
        name: 'Luz propia',
        icon: 'bolt',
        color: '#FFAA00',
        amountType: 'VARIABLE',
        expectedAmountCents: null,
        intervalUnit: 'MONTH',
        intervalCount: 1,
        anchorDate: '2026-01-01',
        isActive: true,
        sortOrder: 0,
        notes: null,
        names: null,
      });
    });

    it('stores per-language names, patches them and clears them with null', async () => {
      const houseId = await newHouse(ctx);
      const id = await newCategory(ctx, houseId, { name: 'Luz', names: { en: 'Electricity', de: 'Strom' } });
      expect((await find(houseId, id))?.names).toEqual({ en: 'Electricity', de: 'Strom' });
      await ctx.api.updateCategory({ houseId, id, names: { fr: 'Électricité' } });
      expect(await find(houseId, id)).toMatchObject({ name: 'Luz', names: { fr: 'Électricité' } });
      await ctx.api.updateCategory({ houseId, id, names: null });
      expect((await find(houseId, id))?.names).toBeNull();
    });

    it('rejects malformed language names', async () => {
      const houseId = await newHouse(ctx);
      await expect(newCategory(ctx, houseId, { names: { 'not a code': 'x' } as never })).rejects.toBeDefined();
      await expect(newCategory(ctx, houseId, { names: { en: '' } })).rejects.toBeDefined();
    });

    it('createCategory stores every optional field', async () => {
      const houseId = await newHouse(ctx);
      const id = await newCategory(ctx, houseId, { amountType: 'FIXED', expectedAmountCents: 9_999, intervalUnit: 'WEEK', intervalCount: 4, isActive: false, sortOrder: 7, notes: 'nota' });
      expect(await find(houseId, id)).toMatchObject({ amountType: 'FIXED', expectedAmountCents: 9_999, intervalUnit: 'WEEK', intervalCount: 4, isActive: false, sortOrder: 7, notes: 'nota' });
    });

    it('accepts the boundary values', async () => {
      const houseId = await newHouse(ctx);
      const a = await newCategory(ctx, houseId, { name: 'n'.repeat(60), icon: 'i'.repeat(40), intervalCount: 1000, sortOrder: 10_000, expectedAmountCents: 10_000_000, notes: 'x'.repeat(500) });
      expect(await find(houseId, a)).toMatchObject({ intervalCount: 1000, sortOrder: 10_000, expectedAmountCents: 10_000_000 });
      const b = await newCategory(ctx, houseId, { intervalCount: 1, sortOrder: 0, expectedAmountCents: 0 });
      expect(await find(houseId, b)).toMatchObject({ intervalCount: 1, sortOrder: 0, expectedAmountCents: 0 });
    });

    it.each([
      ['empty name', { name: '' }],
      ['name over 60 chars', { name: 'n'.repeat(61) }],
      ['empty icon', { icon: '' }],
      ['icon over 40 chars', { icon: 'i'.repeat(41) }],
      ['color that is not #RRGGBB', { color: 'red' }],
      ['unknown amountType', { amountType: 'WEIRD' as never }],
      ['unknown intervalUnit', { intervalUnit: 'DECADE' as never }],
      ['intervalCount 0', { intervalCount: 0 }],
      ['intervalCount 1001', { intervalCount: 1001 }],
      ['negative sortOrder', { sortOrder: -1 }],
      ['sortOrder 10001', { sortOrder: 10_001 }],
      ['negative expectedAmountCents', { expectedAmountCents: -1 }],
      ['expectedAmountCents over 10,000,000', { expectedAmountCents: 10_000_001 }],
      ['notes over 500 chars', { notes: 'x'.repeat(501) }],
      ['malformed anchorDate', { anchorDate: '01/01/2026' }],
      ['FIXED without expectedAmountCents', { amountType: 'FIXED' as const }],
    ])('createCategory rejects %s', async (_label, over) => {
      const houseId = await newHouse(ctx);
      await expect(ctx.api.createCategory({ houseId, id: uuid(), ...categoryInput(over) })).rejects.toThrow();
    });

    it('updateCategory patches only the given fields', async () => {
      const houseId = await newHouse(ctx);
      const id = await newCategory(ctx, houseId, { name: 'Antes', notes: 'n' });
      await ctx.api.updateCategory({ houseId, id, name: 'Despues', color: '#00FF00', intervalCount: 3 });
      expect(await find(houseId, id)).toMatchObject({ name: 'Despues', color: '#00FF00', intervalCount: 3, icon: 'bolt', notes: 'n' });
      await ctx.api.updateCategory({ houseId, id, notes: null });
      expect((await find(houseId, id))?.notes).toBeNull();
    });

    it('updateCategory rejects invalid values and a switch to FIXED without an amount', async () => {
      const houseId = await newHouse(ctx);
      const id = await newCategory(ctx, houseId);
      await expect(ctx.api.updateCategory({ houseId, id, name: '' })).rejects.toThrow();
      await expect(ctx.api.updateCategory({ houseId, id, color: 'nope' })).rejects.toThrow();
      await expect(ctx.api.updateCategory({ houseId, id, amountType: 'FIXED' })).rejects.toThrow();
      await ctx.api.updateCategory({ houseId, id, amountType: 'FIXED', expectedAmountCents: 100 });
      expect(await find(houseId, id)).toMatchObject({ amountType: 'FIXED', expectedAmountCents: 100 });
    });

    it('archiveCategory toggles isActive without deleting', async () => {
      const houseId = await newHouse(ctx);
      const id = await newCategory(ctx, houseId);
      await ctx.api.archiveCategory({ houseId, id, isActive: false });
      expect((await find(houseId, id))?.isActive).toBe(false);
      await ctx.api.archiveCategory({ houseId, id, isActive: true });
      expect((await find(houseId, id))?.isActive).toBe(true);
    });

    it('setCategorySortOrder reorders the list (sortOrder asc, then name)', async () => {
      const houseId = await newHouse(ctx);
      const a = await newCategory(ctx, houseId, { name: 'A-cat' });
      const b = await newCategory(ctx, houseId, { name: 'B-cat' });
      await ctx.api.setCategorySortOrder({ houseId, id: a, sortOrder: 9_000 });
      await ctx.api.setCategorySortOrder({ houseId, id: b, sortOrder: 8_000 });
      const list = await ctx.api.listCategories({ houseId });
      expect(list.findIndex((c) => c.id === b)).toBeLessThan(list.findIndex((c) => c.id === a));
      expect(list.map((c) => c.sortOrder)).toEqual([...list.map((c) => c.sortOrder)].sort((x, y) => x - y));
      await expect(ctx.api.setCategorySortOrder({ houseId, id: a, sortOrder: -1 })).rejects.toThrow();
    });

    it('ties on sortOrder are ordered by name', async () => {
      const houseId = await newHouse(ctx);
      const z = await newCategory(ctx, houseId, { name: 'zzz-last', sortOrder: 5_000 });
      const a = await newCategory(ctx, houseId, { name: 'aaa-first', sortOrder: 5_000 });
      const ids = (await ctx.api.listCategories({ houseId })).map((c) => c.id);
      expect(ids.indexOf(a)).toBeLessThan(ids.indexOf(z));
    });

    it('deleteCategory removes an unused category', async () => {
      const houseId = await newHouse(ctx);
      const id = await newCategory(ctx, houseId);
      await ctx.api.deleteCategory({ houseId, id });
      expect(await find(houseId, id)).toBeUndefined();
    });

    it('deleteCategory refuses with CATEGORY_HAS_BILLS while a bill uses it; archive instead', async () => {
      const houseId = await newHouse(ctx);
      const id = await newCategory(ctx, houseId);
      const billId = uuid();
      await ctx.api.createBill({ houseId, id: billId, categoryId: id, amountCents: 100, chargeDate: '2026-03-01' });
      await expect(ctx.api.deleteCategory({ houseId, id })).rejects.toThrow('CATEGORY_HAS_BILLS');
      await ctx.api.archiveCategory({ houseId, id, isActive: false });
      expect((await find(houseId, id))?.isActive).toBe(false);
      await ctx.api.deleteBill({ houseId, id: billId });
      await ctx.api.deleteCategory({ houseId, id });
      expect(await find(houseId, id)).toBeUndefined();
    });

    it('categories are scoped to their house', async () => {
      const h1 = await newHouse(ctx);
      const h2 = await newHouse(ctx);
      const id = await newCategory(ctx, h1, { name: 'Solo h1' });
      expect(await find(h1, id)).toBeDefined();
      expect(await find(h2, id)).toBeUndefined();
    });
  });
}
