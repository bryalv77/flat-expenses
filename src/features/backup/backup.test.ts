import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

import { migrate } from '@/lib/api/local/migrate';
import { migrations } from '@/lib/api/local/migrations';
import type { SqlDb } from '@/lib/api/local/sql';
import { createTestDb } from '@/lib/api/local/testDb';

import { BackupError, exportBackup, importBackup, wipeAllLocalData, type BackupFiles } from './backup';

function memFiles(): BackupFiles & { map: Map<string, Uint8Array> } {
  const map = new Map<string, Uint8Array>();
  return {
    map,
    list: async () => [...map.keys()],
    read: async (k) => map.get(k) ?? null,
    write: async (k, b) => void map.set(k, b),
    remove: async (k) => void map.delete(k),
  };
}

const ts = '2026-01-01T00:00:00.000Z';
async function seed(db: SqlDb, files: ReturnType<typeof memFiles>) {
  await db.run(`insert into users (id, email, display_name, photo_path, created_at, updated_at) values ('u1','a@b.c','Ana','u/u1/avatar/a.jpg',?,?)`, [ts, ts]);
  await db.run(`insert into houses (id, name, split_mode, created_by, created_at, updated_at) values ('h1','Casa','EQUAL','u1',?,?)`, [ts, ts]);
  await db.run(`insert into members (house_id, user_id, role, status, joined_at, display_name) values ('h1','u1','ADMIN','ACTIVE',?, 'Ana')`, [ts]);
  await db.run(`insert into categories (id, house_id, name, amount_type, created_at, updated_at) values ('c1','h1','Luz','FIXED',?,?)`, [ts, ts]);
  await db.run(`insert into bills (id, house_id, category_id, amount_cents, charge_date, created_by, created_at, updated_at) values ('b1','h1','c1',1234,'2026-01-05','u1',?,?)`, [ts, ts]);
  await db.run(`insert into bill_files (id, bill_id, path, file_name, mime_type, size_bytes) values ('f1','b1','h1/bills/b1/x.pdf','x.pdf','application/pdf',3)`);
  await db.run(`insert into payments (id, house_id, member_id, month, amount_cents, paid_at, recorded_by) values ('p1','h1','u1','2026-01',500,?,'u1')`, [ts]);
  files.map.set('h1/bills/b1/x.pdf', new Uint8Array([1, 2, 3]));
  files.map.set('u/u1/avatar/a.jpg', new Uint8Array([9, 8]));
}
const dump = async (db: SqlDb) => {
  const out: Record<string, unknown[]> = {};
  for (const t of ['users', 'houses', 'members', 'categories', 'bills', 'bill_files', 'payments'])
    out[t] = await db.all(`select * from ${t}`);
  return out;
};
const fresh = async () => {
  const db = createTestDb();
  await migrate(db);
  return db;
};
const codeOf = async (p: Promise<unknown>) =>
  p.then(
    () => 'ok',
    (e) => (e as BackupError).code,
  );
const keepUser = (db: SqlDb) =>
  db.run(`insert into users (id, display_name, created_at, updated_at) values ('keep','K',?,?)`, [ts, ts]);
// Exports a seeded DB, applies `mutate` to data.json, returns the re-zipped archive.
async function tampered(mutate: (d: any) => void) {
  const src = await fresh();
  const sf = memFiles();
  await seed(src, sf);
  const z = unzipSync(await exportBackup(src, sf));
  const data = JSON.parse(strFromU8(z['data.json']));
  mutate(data);
  z['data.json'] = strToU8(JSON.stringify(data));
  return zipSync(z);
}

describe('backup', () => {
  it('round trips rows and file bytes into an empty DB', async () => {
    const db = await fresh();
    const files = memFiles();
    await seed(db, files);
    const archive = await exportBackup(db, files);
    const db2 = await fresh();
    const files2 = memFiles();
    await importBackup(db2, files2, archive);
    expect(await dump(db2)).toEqual(await dump(db));
    expect([...files2.map.entries()]).toEqual([...files.map.entries()]);
  });

  it('records schema_version in data.json', async () => {
    const db = await fresh();
    const data = JSON.parse(strFromU8(unzipSync(await exportBackup(db, memFiles()))['data.json']));
    expect(data.schema_version).toBe(migrations.length);
  });

  it('refuses a newer schema_version and changes nothing', async () => {
    const archive = await tampered((d) => (d.schema_version = 999));
    const db = await fresh();
    await keepUser(db);
    expect(await codeOf(importBackup(db, memFiles(), archive))).toBe('newer-version');
    expect(await db.all('select id from users')).toEqual([{ id: 'keep' }]);
  });

  it('a corrupt or truncated archive changes nothing', async () => {
    const archive = await tampered(() => undefined);
    const db = await fresh();
    const files = memFiles();
    files.map.set('old', new Uint8Array([7]));
    await keepUser(db);
    for (const bad of [archive.slice(0, archive.length - 30), new Uint8Array([1, 2, 3]), new Uint8Array(0)]) {
      expect(await codeOf(importBackup(db, files, bad))).toBe('corrupt');
    }
    expect(await db.all('select id from users')).toEqual([{ id: 'keep' }]);
    expect([...files.map.keys()]).toEqual(['old']);
  });

  it('rolls back DB and files when an insert fails mid-import', async () => {
    const archive = await tampered((d) => (d.tables.bills[0].amount_cents = 0)); // violates a check constraint
    const db = await fresh();
    const files = memFiles();
    files.map.set('h1/bills/b1/x.pdf', new Uint8Array([5])); // collides with an archive key
    files.map.set('old', new Uint8Array([7]));
    await keepUser(db);
    expect(await codeOf(importBackup(db, files, archive))).toBe('invalid');
    expect(await db.all('select id from users')).toEqual([{ id: 'keep' }]);
    expect(Object.fromEntries(files.map)).toEqual({ 'h1/bills/b1/x.pdf': new Uint8Array([5]), old: new Uint8Array([7]) });
  });

  it('import replaces existing data entirely', async () => {
    const archive = await tampered(() => undefined);
    const db = await fresh();
    const files = memFiles();
    files.map.set('old', new Uint8Array([7]));
    await db.run(`insert into users (id, display_name, created_at, updated_at) values ('other','O',?,?)`, [ts, ts]);
    await importBackup(db, files, archive);
    expect((await db.all<{ id: string }>('select id from users')).map((r) => r.id)).toEqual(['u1']);
    expect(files.map.has('old')).toBe(false);
  });

  it.each([
    ['unknown table', (d: any) => (d.tables.evil = [{ a: 1 }])],
    ['unknown column', (d: any) => (d.tables.users[0]['x); drop table users;--'] = 'v')],
    ['non-scalar value', (d: any) => (d.tables.users[0].email = { a: 1 })],
  ])('rejects %s', async (_n, mutate) => {
    const archive = await tampered(mutate);
    const db = await fresh();
    expect(await codeOf(importBackup(db, memFiles(), archive))).toBe('invalid');
    expect(await db.all('select id from users')).toEqual([]);
  });

  it.each(['files/../evil', 'files//abs', 'files/a/../b'])('rejects unsafe file key %s', async (name) => {
    const z = unzipSync(await exportBackup(await fresh(), memFiles()));
    z[name] = new Uint8Array([1]);
    const files = memFiles();
    expect(await codeOf(importBackup(await fresh(), files, zipSync(z)))).toBe('invalid');
    expect(files.map.size).toBe(0);
  });

  it('wipeAllLocalData removes rows and files', async () => {
    const db = await fresh();
    const files = memFiles();
    await seed(db, files);
    await wipeAllLocalData(db, files);
    for (const rows of Object.values(await dump(db))) expect(rows).toEqual([]);
    expect(files.map.size).toBe(0);
  });
});
