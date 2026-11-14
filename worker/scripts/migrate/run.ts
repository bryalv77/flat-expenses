// Firebase -> Neon (Postgres) + R2 migration (issue #7 §8).  Dry run by default; nothing is written without --apply.
//
//   node --experimental-strip-types --no-warnings scripts/migrate/run.ts [options]
//
//   --project <id>           Firebase project (default costos-piso)
//   --emulator               read from the local Firebase emulators (auth 9099, firestore 8080, storage 9199) instead of the real project
//   --bucket <name>          Firebase Storage bucket (default <project>.firebasestorage.app, emulator: <project>.appspot.com)
//   --database-url <url>     target Postgres (default $DATABASE_URL)
//   --r2 local|remote        where files go (default local: wrangler's local R2, as used by `pnpm dev:local`)
//   --r2-bucket <name>       default costos-piso-files   (remote uses --jurisdiction eu)
//   --apply                  write to Postgres and copy files
//   --skip-files             do not copy files        --files-only   only copy files
//   --verify                 after --apply: compare counts with the source, and sample-check copied files
//
// Real project: needs Application Default Credentials with read access to Auth, Firestore and Storage
// (`gcloud auth application-default login`, or GOOGLE_APPLICATION_CREDENTIALS=<service account json>).
// Safe to re-run: rows that already exist are left untouched (ON CONFLICT DO NOTHING), and copied files are tracked in a manifest.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { cert, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import pg from 'pg';

import { firebaseScryptHash, type FirebaseScryptParams } from '../../src/firebasePassword.ts';
import { transform, type HouseSrc, type Plan, type Source } from './transform.ts';

const { values: o } = parseArgs({
  options: {
    project: { type: 'string', default: 'costos-piso' }, emulator: { type: 'boolean', default: false }, bucket: { type: 'string' },
    'database-url': { type: 'string' }, r2: { type: 'string', default: 'local' }, 'r2-bucket': { type: 'string', default: 'costos-piso-files' },
    apply: { type: 'boolean', default: false }, 'skip-files': { type: 'boolean', default: false }, 'files-only': { type: 'boolean', default: false }, verify: { type: 'boolean', default: false },
  },
});
const databaseUrl = o['database-url'] ?? process.env.DATABASE_URL;
if (o.r2 !== 'local' && o.r2 !== 'remote') throw new Error('--r2 must be local or remote');
if (o.apply && !databaseUrl) throw new Error('--apply needs --database-url (or $DATABASE_URL)');

// Parameters the emulator rehearsal uses to turn its fake password hashes into real Firebase scrypt hashes.
// Put the same values in worker/.dev.vars.local (FIREBASE_SCRYPT_*) to sign in as a migrated rehearsal user.
export const REHEARSAL_PARAMS: FirebaseScryptParams = { memCost: 14, rounds: 8, saltSeparator: 'Bw==', signerKey: 'jxspr8Ki0RYycVU8zykbdLGjFQ3McFUH0uiiTvC8pVMXAn210wjLNmdZJzxUECKbm0QsEmYUSDzZvpjeJ9WmXA==' };

// ---------------------------------------------------------------- extract (read-only)
if (o.emulator) {
  process.env.FIRESTORE_EMULATOR_HOST ??= 'localhost:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= 'localhost:9099';
  process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= 'localhost:9199';
}
const bucketName = o.bucket ?? (o.emulator ? `${o.project}.appspot.com` : `${o.project}.firebasestorage.app`);
initializeApp({
  projectId: o.project, storageBucket: bucketName,
  // the emulators need no credentials (and reject an explicit `credential: undefined`)
  ...(o.emulator ? {} : { credential: process.env.GOOGLE_APPLICATION_CREDENTIALS ? cert(JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'))) : applicationDefault() }),
});

const iso = (v: unknown): unknown => (v instanceof Timestamp ? v.toDate().toISOString() : v);
const fixTs = (data: Record<string, unknown>) => Object.fromEntries(Object.entries(data).map(([k, v]) => [k, iso(v)]));

async function extract(): Promise<Source> {
  const db = getFirestore();
  const authUsers: Source['authUsers'] = [];
  let pageToken: string | undefined;
  do {
    const page = await getAuth().listUsers(1000, pageToken);
    for (const u of page.users) {
      let { passwordHash, passwordSalt } = u;
      // The Auth emulator stores `fakeHash:salt=<salt>:password=<plain password>`: turn it into a real Firebase hash so the
      // rehearsal exercises the same sign-in path as production. (Never happens against a real project.)
      const fake = passwordHash?.match(/^fakeHash:salt=(.*):password=(.*)$/);
      if (o.emulator && fake && passwordSalt) passwordHash = await firebaseScryptHash(fake[2]!, passwordSalt, REHEARSAL_PARAMS);
      authUsers.push({
        uid: u.uid, email: u.email, emailVerified: u.emailVerified, displayName: u.displayName, photoURL: u.photoURL, passwordHash, passwordSalt,
        providers: u.providerData.map((p) => ({ providerId: p.providerId, uid: p.uid })), createdAt: u.metadata.creationTime ? new Date(u.metadata.creationTime).toISOString() : undefined,
      });
    }
    pageToken = page.pageToken;
  } while (pageToken);

  const profiles: Source['profiles'] = {}, documents: Source['documents'] = {};
  for (const d of (await db.collection('users').get()).docs) {
    profiles[d.id] = fixTs(d.data()) as Source['profiles'][string];
    documents[d.id] = (await d.ref.collection('documents').get()).docs.map((x) => ({ id: x.id, ...fixTs(x.data()) }));
  }

  const houses: HouseSrc[] = [];
  for (const h of (await db.collection('houses').get()).docs) {
    const sub = async (name: string) => (await h.ref.collection(name).get()).docs.map((x) => ({ id: x.id, ...fixTs(x.data()) }));
    houses.push({ id: h.id, ...fixTs(h.data()), members: await sub('members'), categories: await sub('categories'), bills: await sub('bills'), payments: await sub('payments') } as HouseSrc);
  }
  const invites = (await db.collection('invites').get()).docs.map((x) => ({ code: x.id, ...fixTs(x.data()) })) as Source['invites'];

  const objects: Source['objects'] = {};
  const [files] = await getStorage().bucket().getFiles();
  for (const f of files) if (!f.name.endsWith('/')) objects[f.name] = Number(f.metadata.size ?? 0);
  return { authUsers, profiles, documents, houses, invites, objects };
}

// ---------------------------------------------------------------- load (Postgres, one transaction)
const jsonCols = new Set(['ocr_data']);
async function insert(c: pg.Client, table: string, rows: Record<string, unknown>[], returning?: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const cols = Object.keys(chunk[0]!);
    const args: unknown[] = [];
    const tuples = chunk.map((r) => `(${cols.map((k) => { args.push(jsonCols.has(k) && r[k] != null ? JSON.stringify(r[k]) : r[k]); return `$${args.length}`; }).join(',')})`);
    const res = await c.query(`insert into "${table}" (${cols.map((k) => `"${k}"`).join(',')}) values ${tuples.join(',')} on conflict do nothing${returning ? ` returning ${returning}` : ''}`, args);
    out.push(...res.rows);
  }
  return out;
}

async function load(plan: Plan): Promise<Record<string, { planned: number; inserted: number }>> {
  const c = new pg.Client({ connectionString: databaseUrl });
  await c.connect();
  const stats: Record<string, { planned: number; inserted: number }> = {};
  const done = (t: string, planned: number, inserted: number) => (stats[t] = { planned, inserted });
  try {
    await c.query('begin');
    for (const t of ['user', 'account', 'user_documents', 'houses', 'members', 'categories'] as const) {
      done(t, plan[t].length, (await insert(c, t, plan[t])).length);
    }
    // bill_files only for bills inserted now: a re-run must not duplicate them (bill_files has no natural key)
    const billRows = plan.bills.map(({ files: _f, ...b }) => b);
    const inserted = new Set((await insert(c, 'bills', billRows, 'id')).map((r) => r.id as string));
    done('bills', plan.bills.length, inserted.size);
    const fileRows = plan.bills.filter((b) => inserted.has(b.id as string)).flatMap((b) => b.files.map((f) => ({ ...f, bill_id: b.id })));
    done('bill_files', plan.bills.reduce((n, b) => n + b.files.length, 0), (await insert(c, 'bill_files', fileRows)).length);
    for (const t of ['payments', 'invites'] as const) done(t, plan[t].length, (await insert(c, t, plan[t])).length);
    await c.query('commit');
  } catch (e) {
    await c.query('rollback');
    throw e;
  } finally {
    await c.end();
  }
  return stats;
}

// ---------------------------------------------------------------- files (Firebase Storage -> R2 through wrangler)
const here = import.meta.dirname;
const manifestPath = join(here, `.files-${o.r2}-${o['r2-bucket']}.json`);
const run = (cmd: string, args: string[]) => new Promise<void>((resolve, reject) => {
  const p = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'], cwd: join(here, '..', '..') });
  let err = '';
  p.stderr.on('data', (d) => (err += d));
  p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.slice(0, 4).join(' ')} failed (${code}): ${err.slice(-300)}`))));
});
const wrangler = (args: string[]) => run('pnpm', ['exec', 'wrangler', ...args, o.r2 === 'remote' ? '--remote' : '--local', ...(o.r2 === 'remote' ? ['--jurisdiction', 'eu'] : [])]);

async function copyFiles(files: Plan['files']): Promise<{ copied: number; skipped: number; failed: string[] }> {
  const manifest: Record<string, number> = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
  const dir = join(tmpdir(), `costospiso-migrate-${process.pid}`);
  mkdirSync(dir, { recursive: true });
  const bucket = getStorage().bucket();
  const todo = files.filter((f) => manifest[f.key] === undefined || manifest[f.key] !== (f.size ?? manifest[f.key])); // manifest is keyed by the R2 key
  const result = { copied: 0, skipped: files.length - todo.length, failed: [] as string[] };
  let next = 0;
  // local R2 is one on-disk store that every wrangler process opens: parallel puts corrupt each other, so serial there
  await Promise.all(Array.from({ length: o.r2 === 'remote' ? 4 : 1 }, async () => {
    while (next < todo.length) {
      const f = todo[next++]!;
      const tmp = join(dir, `${next}.bin`);
      try {
        const file = bucket.file(f.from);
        await file.download({ destination: tmp });
        const contentType = f.contentType ?? (await file.getMetadata())[0].contentType ?? 'application/octet-stream';
        await wrangler(['r2', 'object', 'put', `${o['r2-bucket']}/${f.key}`, '--file', tmp, '--content-type', contentType]);
        manifest[f.key] = f.size ?? 0;
        writeFileSync(manifestPath, JSON.stringify(manifest, null, 1)); // after every file: an interrupted run resumes where it stopped
        result.copied++;
      } catch (e) {
        result.failed.push(`${f.key}: ${(e as Error).message}`);
      }
    }
  }));
  return result;
}

async function verify(plan: Plan, files: Plan['files']) {
  const c = new pg.Client({ connectionString: databaseUrl });
  await c.connect();
  const problems: string[] = [];
  for (const [t, key] of [['user', 'id'], ['houses', 'id'], ['members', 'user_id'], ['categories', 'id'], ['bills', 'id'], ['payments', 'id'], ['invites', 'code'], ['user_documents', 'id']] as const) {
    const ids = (plan[t] as Record<string, unknown>[]).map((r) => r[key] as string);
    const found = (await c.query(`select count(*)::int as n from "${t}" where "${key}" = any($1)`, [ids])).rows[0].n as number;
    if (t !== 'members' && found !== ids.length) problems.push(`${t}: ${ids.length} planned rows, ${found} found in Postgres`);
  }
  await c.end();
  // sample: the biggest file and a few others must come back from R2 with the same size
  const sample = [...files].sort((a, b) => (b.size ?? 0) - (a.size ?? 0)).slice(0, 1).concat(files.slice(0, 4));
  const dir = join(tmpdir(), `costospiso-verify-${process.pid}`);
  mkdirSync(dir, { recursive: true });
  for (const [i, f] of sample.entries()) {
    const out = join(dir, `${i}.bin`);
    try {
      await wrangler(['r2', 'object', 'get', `${o['r2-bucket']}/${f.key}`, '--file', out]);
      const size = readFileSync(out).length;
      if (f.size != null && size !== f.size) problems.push(`R2 ${f.key}: ${size} bytes, expected ${f.size}`);
    } catch (e) { problems.push(`R2 ${f.key}: ${(e as Error).message.slice(0, 120)}`); }
  }
  return problems;
}

// ---------------------------------------------------------------- main
const t0 = Date.now();
console.log(`source: ${o.emulator ? 'Firebase EMULATORS' : 'Firebase project ' + o.project} (bucket ${bucketName})   target: ${o.apply ? 'Postgres + R2 ' + o.r2 : 'DRY RUN (nothing is written)'}`);
const src = await extract();
const { plan, issues } = transform(src);
console.log(`\nread:    ${src.authUsers.length} auth users, ${Object.keys(src.profiles).length} profiles, ${src.houses.length} houses, ${Object.keys(src.objects).length} storage objects`);
console.log(`planned: ${Object.entries(plan).map(([k, v]) => `${k}=${(v as unknown[]).length}`).join('  ')}`);

const by = (l: string) => issues.filter((i) => i.level === l);
console.log(`\nissues:  ${by('skip').length} skipped rows, ${by('fix').length} repaired, ${by('warn').length} warnings`);
for (const level of ['skip', 'fix', 'warn'] as const) for (const i of by(level).slice(0, 15)) console.log(`  [${level}] ${i.where}: ${i.message}`);
if (issues.length > 45) console.log(`  … full list in scripts/migrate/last-report.json`);
writeFileSync(join(here, 'last-report.json'), JSON.stringify({ at: new Date().toISOString(), counts: Object.fromEntries(Object.entries(plan).map(([k, v]) => [k, (v as unknown[]).length])), issues }, null, 1)); // no rows: they contain password hashes

let problems: string[] = [];
if (o.apply) {
  if (!o['files-only']) {
    const stats = await load(plan);
    console.log('\nPostgres (inserted / planned; existing rows are left untouched):');
    for (const [t, s] of Object.entries(stats)) console.log(`  ${t.padEnd(15)} ${String(s.inserted).padStart(5)} / ${s.planned}`);
  }
  if (!o['skip-files']) {
    const r = await copyFiles(plan.files);
    console.log(`\nfiles → R2 (${o.r2}): ${r.copied} copied, ${r.skipped} already done, ${r.failed.length} failed`);
    for (const f of r.failed.slice(0, 10)) console.log(`  FAILED ${f}`);
    problems.push(...r.failed);
  }
  if (o.verify) {
    problems.push(...(await verify(plan, plan.files)));
    console.log(problems.length ? `\nVERIFY: ${problems.length} problem(s)\n  ${problems.slice(0, 10).join('\n  ')}` : '\nVERIFY: counts match and sampled files are byte-for-byte the same size');
  }
} else console.log('\nDry run only. Re-run with --apply to write.');
console.log(`\ndone in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
process.exit(problems.length ? 1 : 0);
