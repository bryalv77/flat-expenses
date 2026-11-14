/** @jest-environment node */
import { createLocalApi } from './index';
import { migrate } from './migrate';
import { createTestDb } from './testDb';

const T = '2026-01-15T10:00:00.000Z';

async function setup() {
  const db = createTestDb();
  await migrate(db);
  await db.exec(`
    insert into houses (id,name,split_mode,created_by,created_at,updated_at) values ('h1','A','EQUAL','local','${T}','${T}'),('h2','B','EQUAL','local','${T}','${T}');
    insert into members (house_id,user_id,role,status,joined_at) values ('h1','local','ADMIN','ACTIVE','${T}');
    insert into members (house_id,user_id,role,status,joined_at,removed_at) values ('h1','gone','ROOMMATE','REMOVED','${T}','${T}');`);
  let n = 0;
  const api = createLocalApi(db, { now: () => `2026-02-01T00:00:0${n++}.000Z` });
  return { db, api };
}
const pay = (o: object = {}) => ({ houseId: 'h1', id: 'p1', memberId: 'local', month: '2026-03-01', amountCents: 100, ...o });

describe('local payments', () => {
  it('records and lists with db.ts shapes', async () => {
    const { api } = await setup();
    await api.recordPayment(pay({ note: 'cash' }));
    expect(await api.listPayments({ houseId: 'h1', from: '2026-01-01', to: '2026-12-01' })).toEqual([
      { id: 'p1', memberId: 'local', month: '2026-03-01', amountCents: 100, paidAt: '2026-02-01T00:00:00.000Z', note: 'cash' },
    ]);
  });

  it('stores recorded_by and defaults note to null', async () => {
    const { db, api } = await setup();
    await api.recordPayment(pay());
    expect(await db.get('select recorded_by, note from payments')).toEqual({ recorded_by: 'local', note: null });
  });

  it.each([
    ['zero', { amountCents: 0 }], ['too big', { amountCents: 10_000_000 }], ['fraction', { amountCents: 1.5 }],
    ['long note', { note: 'x'.repeat(201) }], ['not 1st', { month: '2026-03-15' }], ['bad month', { month: '2026-13-01' }],
    ['stranger', { memberId: 'nobody' }], ['other house member', { houseId: 'h2' }],
  ])('rejects %s', async (_l, over) => {
    const { api, db } = await setup();
    await expect(api.recordPayment(pay(over))).rejects.toThrow();
    expect(await db.all('select * from payments')).toEqual([]);
  });

  it('accepts bounds, 200 char note and a removed member', async () => {
    const { api } = await setup();
    await api.recordPayment(pay({ id: 'a', amountCents: 1 }));
    await api.recordPayment(pay({ id: 'b', amountCents: 9_999_999, note: 'x'.repeat(200), memberId: 'gone' }));
    expect(await api.listPayments({ houseId: 'h1', from: '2026-03-01', to: '2026-03-01' })).toHaveLength(2);
  });

  it('filters an inclusive range, month desc', async () => {
    const { api } = await setup();
    for (const [i, m] of ['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01'].entries()) await api.recordPayment(pay({ id: `m${i}`, month: m }));
    const got = await api.listPayments({ houseId: 'h1', from: '2026-02-01', to: '2026-03-01' });
    expect(got.map((p) => p.month)).toEqual(['2026-03-01', '2026-02-01']);
    await expect(api.listPayments({ houseId: 'h1', from: '2026-02-15', to: '2026-03-01' })).rejects.toThrow();
  });

  it('deletes only that payment; a missing one is a no-op', async () => {
    const { api } = await setup();
    await api.recordPayment(pay({ id: 'a' }));
    await api.recordPayment(pay({ id: 'b' }));
    await api.deletePayment({ houseId: 'h1', id: 'a' });
    await api.deletePayment({ houseId: 'h1', id: 'zzz' });
    expect((await api.listPayments({ houseId: 'h1', from: '2026-01-01', to: '2026-12-01' })).map((p) => p.id)).toEqual(['b']);
  });

  it('cascades on house delete', async () => {
    const { api, db } = await setup();
    await api.recordPayment(pay());
    await db.run("delete from houses where id = 'h1'");
    expect(await db.all('select * from payments')).toEqual([]);
  });
});
