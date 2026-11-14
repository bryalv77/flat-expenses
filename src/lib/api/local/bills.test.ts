import type { BillFile } from '@/types/domain';

import { makeBillsApi, sweepOrphanFiles } from './bills';
import type { LocalCtx } from './ctx';
import { migrate } from './migrate';
import type { SqlDb } from './sql';
import { createTestDb } from './testDb';

const H = 'h1';
const CAT = 'c1';
const file = (n: number, bill = 'b1'): BillFile => ({ storagePath: `houses/${H}/bills/${bill}/f${n}.png`, fileName: `f${n}.png`, mimeType: 'image/png', sizeBytes: 10 });

async function setup(overrides: Partial<LocalCtx> = {}) {
  const db = createTestDb();
  await migrate(db);
  const ts = '2026-01-01T00:00:00.000Z';
  await db.run("insert into houses (id, name, split_mode, created_by, created_at, updated_at) values (?, 'H', 'EQUAL', 'local', ?, ?)", [H, ts, ts]);
  for (const c of [CAT, 'c2']) {
    await db.run("insert into categories (id, house_id, name, amount_type, created_at, updated_at) values (?, ?, 'C', 'VARIABLE', ?, ?)", [c, H, ts, ts]);
  }
  await db.run("insert into houses (id, name, split_mode, created_by, created_at, updated_at) values ('h2', 'H2', 'EQUAL', 'local', ?, ?)", [ts, ts]);
  const events: string[] = [];
  const ctx: LocalCtx = {
    db, userId: 'local', now: () => '2026-03-20T10:00:00.000Z',
    deleteFiles: async (p) => { events.push(`delete:${p.join(',')}`); },
    deleteFolder: async () => undefined,
    ...overrides,
  };
  const api = makeBillsApi(ctx) as Required<ReturnType<typeof makeBillsApi>>;
  return { db, ctx, api, events };
}
const base = { houseId: H, categoryId: CAT, amountCents: 100, chargeDate: '2026-03-01' };

describe('local bills', () => {
  it('create + get round-trip with defaults', async () => {
    const { api } = await setup();
    await api.createBill({ ...base, id: 'b1' });
    expect(await api.getBill({ houseId: H, id: 'b1' })).toEqual({
      id: 'b1', categoryId: CAT, amountCents: 100, chargeDate: '2026-03-01', periodStartDate: null, periodEndDate: null,
      files: [], notes: null, ocrStatus: 'NONE', ocrData: null, createdAt: '2026-03-20T10:00:00.000Z',
    });
    expect(await api.getBill({ houseId: 'h2', id: 'b1' })).toBeNull();
    expect(await api.getBill({ houseId: H, id: 'nope' })).toBeNull();
  });

  it('accepts amount bounds and notes of 1000, rejects outside them', async () => {
    const { api } = await setup();
    for (const amountCents of [1, 9_999_999]) await api.createBill({ ...base, id: `ok${amountCents}`, amountCents, notes: 'x'.repeat(1000) });
    for (const over of [{ amountCents: 0 }, { amountCents: 10_000_000 }, { amountCents: 1.5 }, { notes: 'x'.repeat(1001) },
      { chargeDate: '15/03/2026' }, { categoryId: 'ghost' }]) {
      await expect(api.createBill({ ...base, id: 'bad', ...over })).rejects.toThrow();
      expect(await api.getBill({ houseId: H, id: 'bad' })).toBeNull();
    }
  });

  it('limits attachments to 5 and keeps their order', async () => {
    const { api } = await setup();
    await expect(api.createBill({ ...base, id: 'b1', files: [0, 1, 2, 3, 4, 5].map((n) => file(n)) })).rejects.toThrow();
    expect(await api.getBill({ houseId: H, id: 'b1' })).toBeNull();
    await api.createBill({ ...base, id: 'b1', files: [3, 1, 2].map((n) => file(n)) });
    expect((await api.getBill({ houseId: H, id: 'b1' }))?.files).toEqual([3, 1, 2].map((n) => file(n)));
  });

  it('updateBill patches only given fields, enforces limits, and fails for unknown bills', async () => {
    const { api } = await setup();
    await api.createBill({ ...base, id: 'b1', notes: 'n' });
    await api.updateBill({ houseId: H, id: 'b1', amountCents: 250, categoryId: 'c2' });
    expect(await api.getBill({ houseId: H, id: 'b1' })).toMatchObject({ amountCents: 250, categoryId: 'c2', chargeDate: '2026-03-01', notes: 'n' });
    await api.updateBill({ houseId: H, id: 'b1', notes: null, chargeDate: null, periodEndDate: '2026-04-01' });
    expect(await api.getBill({ houseId: H, id: 'b1' })).toMatchObject({ notes: null, chargeDate: null, periodEndDate: '2026-04-01' });
    for (const bad of [{ amountCents: 0 }, { amountCents: 10_000_000 }, { notes: 'x'.repeat(1001) }, { categoryId: 'ghost' }, { files: [0, 1, 2, 3, 4, 5].map((n) => file(n)) }]) {
      await expect(api.updateBill({ houseId: H, id: 'b1', ...bad })).rejects.toThrow();
    }
    expect((await api.getBill({ houseId: H, id: 'b1' }))?.amountCents).toBe(250);
    await expect(api.updateBill({ houseId: H, id: 'nope', amountCents: 5 })).rejects.toThrow('Bill not found');
  });

  it('listBills: inclusive effective-date range, newest first, category filter, house scoped', async () => {
    const { api } = await setup();
    await api.createBill({ ...base, id: 'a', chargeDate: '2026-03-01' });
    await api.createBill({ ...base, id: 'b', chargeDate: null, periodEndDate: '2026-03-10', categoryId: 'c2' });
    await api.createBill({ ...base, id: 'c', chargeDate: null }); // created 2026-03-20
    await api.createBill({ ...base, id: 'd', chargeDate: '2026-04-01' });
    const ids = async (from: string, to: string, categoryId?: string) => (await api.listBills({ houseId: H, from, to, categoryId })).map((b) => b.id);
    expect(await ids('2026-03-01', '2026-03-31')).toEqual(['c', 'b', 'a']);
    expect(await ids('2026-03-10', '2026-03-10')).toEqual(['b']);
    expect(await ids('2026-03-01', '2026-04-01', 'c2')).toEqual(['b']);
    expect(await ids('2025-01-01', '2025-12-31')).toEqual([]);
    expect(await api.listBills({ houseId: 'h2', from: '2026-01-01', to: '2026-12-31' })).toEqual([]);
  });

  it('deleteBill cascades bill_files rows and deletes the files', async () => {
    const { api, db, events } = await setup();
    await api.createBill({ ...base, id: 'b1', files: [file(0), file(1)] });
    await api.deleteBill({ houseId: H, id: 'b1' });
    expect(await api.getBill({ houseId: H, id: 'b1' })).toBeNull();
    expect(await db.all('select * from bill_files')).toEqual([]);
    expect(events).toEqual([`delete:${file(0).storagePath},${file(1).storagePath}`]);
  });

  it('deleteBill of another house leaves bill and files alone', async () => {
    const { api, events } = await setup();
    await api.createBill({ ...base, id: 'b1', files: [file(0)] });
    await api.deleteBill({ houseId: 'h2', id: 'b1' });
    expect(await api.getBill({ houseId: H, id: 'b1' })).not.toBeNull();
    expect(events).toEqual([]);
  });

  it('updateBill deletes only the removed attachments, after commit', async () => {
    const { api, events } = await setup();
    await api.createBill({ ...base, id: 'b1', files: [file(0), file(1)] });
    await api.updateBill({ houseId: H, id: 'b1', files: [file(1), file(2)] });
    expect((await api.getBill({ houseId: H, id: 'b1' }))?.files.map((f) => f.fileName)).toEqual(['f1.png', 'f2.png']);
    expect(events).toEqual([`delete:${file(0).storagePath}`]);
  });

  it('deletes files only after the transaction commits, and never when it fails', async () => {
    const order: string[] = [];
    const { api, db, ctx } = await setup();
    const tx = db.transaction.bind(db);
    (db as SqlDb).transaction = async (fn) => {
      const r = await tx(fn);
      order.push('commit');
      return r;
    };
    ctx.deleteFiles = async () => { order.push('deleteFiles'); };
    await api.createBill({ ...base, id: 'b1', files: [file(0)] });
    await api.deleteBill({ houseId: H, id: 'b1' });
    expect(order).toEqual(['commit', 'commit', 'deleteFiles']);

    // failing transaction: rolled back, files untouched
    order.length = 0;
    await api.createBill({ ...base, id: 'b2', files: [file(0, 'b2')] });
    order.length = 0;
    const real = db.run.bind(db);
    (db as SqlDb).run = async (sql, params) => {
      if (sql.startsWith('delete from bills')) throw new Error('boom');
      return real(sql, params);
    };
    await expect(api.deleteBill({ houseId: H, id: 'b2' })).rejects.toThrow('boom');
    await expect(api.updateBill({ houseId: H, id: 'b2', files: [], amountCents: 0 })).rejects.toThrow();
    expect(order).toEqual([]);
    expect((db as SqlDb).run).not.toBe(real);
    (db as SqlDb).run = real;
    expect((await api.getBill({ houseId: H, id: 'b2' }))?.files).toHaveLength(1);
  });

  it('a failing deleteFiles does not fail the (already committed) delete', async () => {
    const { api } = await setup({ deleteFiles: async () => { throw new Error('disk'); } });
    await api.createBill({ ...base, id: 'b1', files: [file(0)] });
    await expect(api.deleteBill({ houseId: H, id: 'b1' })).resolves.toBeUndefined();
    expect(await api.getBill({ houseId: H, id: 'b1' })).toBeNull();
  });

  it('sweepOrphanFiles deletes only unreferenced files', async () => {
    const { api, ctx, events } = await setup();
    await api.createBill({ ...base, id: 'b1', files: [file(0)] });
    const orphan = 'houses/h1/bills/gone/x.png';
    const swept = await sweepOrphanFiles(ctx, async () => [file(0).storagePath, orphan]);
    expect(swept).toEqual([orphan]);
    expect(events).toEqual([`delete:${orphan}`]);
    events.length = 0;
    expect(await sweepOrphanFiles(ctx, async () => [file(0).storagePath])).toEqual([]);
    expect(events).toEqual([]);
  });
});
