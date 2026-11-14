import { migrate } from './migrate';
import { createTestDb } from './testDb';
import { createLocalApi } from './index';
import type { SqlDb } from './sql';

const cat = (o = {}) => ({ name: 'Luz', icon: 'bolt', color: '#FFAA00', amountType: 'VARIABLE' as const, intervalUnit: 'MONTH' as const, intervalCount: 1, anchorDate: '2026-01-01', ...o });
const H = 'h1';
let db: SqlDb;
let api: ReturnType<typeof createLocalApi>;
let n = 0;
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

beforeEach(async () => {
  db = createTestDb();
  await migrate(db);
  await db.run(`insert into houses (id,name,split_mode,created_by,created_at,updated_at) values (?,?,?,?,?,?)`, [H, 'C', 'EQUAL', 'local', 'x', 'x']);
  await db.run(`insert into members (house_id,user_id,role,status,joined_at) values (?,?,?,?,?)`, [H, 'local', 'ADMIN', 'ACTIVE', 'x']);
  api = createLocalApi(db);
});

describe('local categories', () => {
  it('create applies defaults and lists camel-cased booleans', async () => {
    const i = id();
    await api.createCategory({ houseId: H, id: i, ...cat() });
    expect(await api.listCategories({ houseId: H })).toEqual([
      { id: i, name: 'Luz', icon: 'bolt', color: '#FFAA00', amountType: 'VARIABLE', expectedAmountCents: null, intervalUnit: 'MONTH', intervalCount: 1, anchorDate: '2026-01-01', isActive: true, sortOrder: 0, notes: null },
    ]);
  });

  it.each([
    [{ name: '' }], [{ name: 'n'.repeat(61) }], [{ icon: '' }], [{ color: 'red' }], [{ intervalCount: 0 }],
    [{ intervalCount: 1001 }], [{ sortOrder: -1 }], [{ sortOrder: 10001 }], [{ expectedAmountCents: -1 }],
    [{ expectedAmountCents: 10_000_001 }], [{ notes: 'x'.repeat(501) }], [{ anchorDate: '01/01/2026' }],
    [{ amountType: 'FIXED' }], [{ intervalUnit: 'DECADE' }],
  ])('create rejects %j', async (over) => {
    await expect(api.createCategory({ houseId: H, id: id(), ...cat(over) } as never)).rejects.toThrow();
  });

  it('create accepts boundaries', async () => {
    await api.createCategory({ houseId: H, id: id(), ...cat({ name: 'n'.repeat(60), intervalCount: 1000, sortOrder: 10_000, expectedAmountCents: 10_000_000, notes: 'x'.repeat(500) }) });
  });

  it('update patches fields, validates the merged result', async () => {
    const i = id();
    await api.createCategory({ houseId: H, id: i, ...cat({ notes: 'n' }) });
    await api.updateCategory({ houseId: H, id: i, name: 'B', intervalCount: 3 });
    await api.updateCategory({ houseId: H, id: i, notes: null });
    expect((await api.listCategories({ houseId: H }))[0]).toMatchObject({ name: 'B', intervalCount: 3, notes: null, icon: 'bolt' });
    await expect(api.updateCategory({ houseId: H, id: i, name: '' })).rejects.toThrow();
    await expect(api.updateCategory({ houseId: H, id: i, amountType: 'FIXED' })).rejects.toThrow();
    await api.updateCategory({ houseId: H, id: i, amountType: 'FIXED', expectedAmountCents: 5 });
    await expect(api.updateCategory({ houseId: H, id: id(), name: 'x' })).rejects.toThrow();
  });

  it('archive toggles; delete removes unless a bill uses it', async () => {
    const i = id();
    await api.createCategory({ houseId: H, id: i, ...cat() });
    await api.archiveCategory({ houseId: H, id: i, isActive: false });
    expect((await api.listCategories({ houseId: H }))[0].isActive).toBe(false);
    await db.run(`insert into bills (id,house_id,category_id,amount_cents,charge_date,created_by,created_at,updated_at) values ('b',?,?,100,'2026-03-01','local','2026-03-01','x')`, [H, i]);
    await expect(api.deleteCategory({ houseId: H, id: i })).rejects.toThrow('CATEGORY_HAS_BILLS');
    await db.run(`delete from bills`);
    await api.deleteCategory({ houseId: H, id: i });
    expect(await api.listCategories({ houseId: H })).toEqual([]);
  });

  it('orders by sortOrder then name; setCategorySortOrder validates', async () => {
    const [a, b, c] = [id(), id(), id()];
    await api.createCategory({ houseId: H, id: a, ...cat({ name: 'a' }) });
    await api.createCategory({ houseId: H, id: b, ...cat({ name: 'b' }) });
    await api.createCategory({ houseId: H, id: c, ...cat({ name: 'c', sortOrder: 1 }) });
    await api.setCategorySortOrder({ houseId: H, id: a, sortOrder: 2 });
    expect((await api.listCategories({ houseId: H })).map((x) => x.id)).toEqual([b, c, a]);
    await expect(api.setCategorySortOrder({ houseId: H, id: a, sortOrder: -1 })).rejects.toThrow();
  });

  it('is scoped to the house and cascades on house delete', async () => {
    await api.createCategory({ houseId: H, id: id(), ...cat() });
    expect(await api.listCategories({ houseId: 'other' })).toEqual([]);
    await db.run(`delete from houses where id=?`, [H]);
    expect(await db.all(`select id from categories`)).toEqual([]);
  });
});
