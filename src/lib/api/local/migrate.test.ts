/** @jest-environment node */
import { migrate } from './migrate';
import { migrations } from './migrations';
import { createTestDb } from './testDb';
import type { SqlDb } from './sql';

const version = async (db: SqlDb) =>
  (await db.get<{ user_version: number }>('PRAGMA user_version'))!.user_version;

const NOW = '2026-01-15T10:00:00.000Z';

async function fresh() {
  const db = createTestDb();
  await migrate(db);
  return db;
}

async function seedHouse(db: SqlDb) {
  await db.exec(`
    insert into houses (id,name,split_mode,created_by,created_at,updated_at) values ('h1','Casa','EQUAL','local','${NOW}','${NOW}');
    insert into members (house_id,user_id,role,status,joined_at) values ('h1','local','ADMIN','ACTIVE','${NOW}');
    insert into categories (id,house_id,name,amount_type,created_at,updated_at) values ('c1','h1','Luz','VARIABLE','${NOW}','${NOW}');`);
}

/** extra: optional [columns, values] appended to the insert. */
const bill = (amount: number, extra?: [string, string]) =>
  `insert into bills (id,house_id,category_id,amount_cents,created_by,created_at,updated_at${extra ? ',' + extra[0] : ''})
   values ('b${amount}','h1','c1',${amount},'local','${NOW}','${NOW}'${extra ? ',' + extra[1] : ''})`;

describe('migrate', () => {
  it('fresh DB runs every script and sets user_version', async () => {
    const db = await fresh();
    expect(await version(db)).toBe(migrations.length);
  });

  it('re-running is a no-op', async () => {
    const db = await fresh();
    await seedHouse(db);
    await migrate(db);
    expect(await version(db)).toBe(migrations.length);
    expect((await db.all('select * from houses')).length).toBe(1);
  });

  it('a failing script rolls back everything and keeps user_version', async () => {
    const db = createTestDb();
    await expect(
      migrate(db, ['create table a (x);', 'create table b (x); select * from nope;']),
    ).rejects.toThrow();
    expect(await version(db)).toBe(0);
    expect(await db.all("select name from sqlite_master where name in ('a','b')")).toEqual([]);
  });

  it('applies only pending scripts', async () => {
    const db = createTestDb();
    await migrate(db, ['create table a (x);']);
    await migrate(db, ['create table a (x);', 'create table b (x);']);
    expect(await version(db)).toBe(2);
  });
});

describe('schema', () => {
  it('has foreign keys on and cascades from houses', async () => {
    const db = await fresh();
    expect((await db.get<{ foreign_keys: number }>('PRAGMA foreign_keys'))!.foreign_keys).toBe(1);
    await seedHouse(db);
    await db.exec(`${bill(500)};
      insert into bill_files (id,bill_id,path,file_name,mime_type,size_bytes) values ('f1','b500','p','n','image/png',1);
      insert into payments (id,house_id,member_id,month,amount_cents,paid_at,recorded_by) values ('p1','h1','local','2026-01',100,'${NOW}','local');`);
    await db.run('delete from houses where id = ?', ['h1']);
    for (const t of ['categories', 'bills', 'bill_files', 'payments', 'members']) {
      expect(await db.all(`select 1 from ${t}`)).toEqual([]);
    }
  });

  it.each([0, 10_000_000])('rejects bill amount %i', async (n) => {
    const db = await fresh();
    await seedHouse(db);
    await expect(db.exec(bill(n))).rejects.toThrow(/CHECK/);
  });

  it('accepts bill amount bounds 1 and 9999999', async () => {
    const db = await fresh();
    await seedHouse(db);
    await db.exec(bill(1));
    await db.exec(bill(9_999_999));
  });

  it('rejects notes over 1000 chars, accepts 1000', async () => {
    const db = await fresh();
    await seedHouse(db);
    await db.exec(bill(1, ['notes', `'${'x'.repeat(1000)}'`]));
    await expect(db.exec(bill(2, ['notes', `'${'x'.repeat(1001)}'`]))).rejects.toThrow(/CHECK/);
  });

  it.each([
    ['ACTIVE', `'${NOW}'`, 'ROOMMATE'],
    ['REMOVED', 'null', 'ROOMMATE'],
    ['GONE', 'null', 'ROOMMATE'],
    ['ACTIVE', 'null', 'OWNER'],
  ])('rejects member status=%s removed_at=%s role=%s', async (status, removed, role) => {
    const db = await fresh();
    await seedHouse(db);
    await expect(
      db.exec(`insert into members (house_id,user_id,role,status,joined_at,removed_at)
        values ('h1','u2','${role}','${status}','${NOW}',${removed})`),
    ).rejects.toThrow(/CHECK/);
  });

  it('accepts REMOVED member with removed_at', async () => {
    const db = await fresh();
    await seedHouse(db);
    await db.exec(`insert into members (house_id,user_id,role,status,joined_at,removed_at)
      values ('h1','u2','ROOMMATE','REMOVED','${NOW}','${NOW}')`);
  });

  it('effective_date = coalesce(charge_date, period_end_date, created date)', async () => {
    const db = await fresh();
    await seedHouse(db);
    await db.exec(bill(1, ['charge_date,period_end_date', "'2026-02-01','2026-03-01'"]));
    await db.exec(bill(2, ['period_end_date', "'2026-03-01'"]));
    await db.exec(bill(3));
    const rows = await db.all<{ id: string; effective_date: string }>(
      'select id, effective_date from bills order by id',
    );
    expect(rows.map((r) => r.effective_date)).toEqual(['2026-02-01', '2026-03-01', '2026-01-15']);
  });

  it('has the blobs table', async () => {
    const db = await fresh();
    await db.run('insert into blobs (path,mime_type,data) values (?,?,?)', [
      'a',
      'image/png',
      new Uint8Array([1, 2]),
    ]);
    expect((await db.all('select * from blobs')).length).toBe(1);
  });
});
