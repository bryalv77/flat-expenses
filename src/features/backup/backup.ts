import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

import { migrations } from '@/lib/api/local/migrations';
import type { SqlDb, SqlParam } from '@/lib/api/local/sql';

/** Archive layout: `data.json` + `files/<key>`. Import REPLACES all local data (it is a restore, not a merge). */
export type BackupErrorCode = 'corrupt' | 'invalid' | 'newer-version' | 'too-large';
export class BackupError extends Error {
  constructor(
    public code: BackupErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'BackupError';
  }
}

/** Platform file access by storage key (native: expo-file-system, web: the blobs table). */
export interface BackupFiles {
  list(): Promise<string[]>;
  read(key: string): Promise<Uint8Array | null>;
  write(key: string, bytes: Uint8Array, mimeType: string): Promise<void>;
  remove(key: string): Promise<void>;
}

// Fixed allowlist, in FK-safe insertion order. The archive is untrusted: SQL is only ever built from this.
// `bills.effective_date` is generated, so it is neither exported nor imported.
const TABLES: Record<string, string[]> = {
  users: ['id', 'email', 'display_name', 'photo_path', 'account_role', 'locale', 'created_at', 'updated_at'],
  houses: ['id', 'name', 'address', 'currency', 'split_mode', 'fixed_contribution_cents', 'contribution_day_of_month', 'show_balance_to_roommates', 'created_by', 'created_at', 'updated_at'],
  members: ['house_id', 'user_id', 'role', 'status', 'joined_at', 'removed_at', 'individual_contribution_cents', 'display_name', 'email', 'photo_path'],
  categories: ['id', 'house_id', 'name', 'icon', 'color', 'amount_type', 'expected_amount_cents', 'interval_unit', 'interval_count', 'anchor_date', 'is_active', 'sort_order', 'notes', 'created_at', 'updated_at'],
  bills: ['id', 'house_id', 'category_id', 'amount_cents', 'charge_date', 'period_start_date', 'period_end_date', 'notes', 'ocr_status', 'ocr_data', 'created_by', 'created_at', 'updated_at'],
  bill_files: ['id', 'bill_id', 'path', 'file_name', 'mime_type', 'size_bytes', 'position'],
  payments: ['id', 'house_id', 'member_id', 'month', 'amount_cents', 'note', 'paid_at', 'recorded_by'],
};
const ORDER = Object.keys(TABLES);
const MAX_TOTAL_BYTES = 300 * 1024 * 1024;
const DEFAULT_MIME = 'image/jpeg'; // avatars: not recorded in the DB

type Row = Record<string, string | number | null>;
interface Payload {
  format: 1;
  schema_version: number;
  exported_at: string;
  tables: Record<string, Row[]>;
  file_mimes: Record<string, string>;
}

const schemaVersion = async (db: SqlDb) => (await db.get<{ user_version: number }>('PRAGMA user_version'))?.user_version ?? 0;

export async function exportBackup(db: SqlDb, files: BackupFiles): Promise<Uint8Array> {
  const tables: Payload['tables'] = {};
  for (const t of ORDER) tables[t] = await db.all<Row>(`select ${TABLES[t].join(', ')} from ${t}`);
  const mimes: Record<string, string> = {};
  for (const u of tables.users) if (u.photo_path) mimes[u.photo_path as string] = DEFAULT_MIME;
  for (const m of tables.members) if (m.photo_path) mimes[m.photo_path as string] = DEFAULT_MIME;
  for (const f of tables.bill_files) mimes[f.path as string] = f.mime_type as string;

  const entries: Record<string, Uint8Array> = {};
  for (const key of await files.list()) {
    const bytes = await files.read(key);
    if (bytes) entries[`files/${key}`] = bytes;
  }
  const payload: Payload = { format: 1, schema_version: await schemaVersion(db), exported_at: new Date().toISOString(), tables, file_mimes: mimes };
  entries['data.json'] = strToU8(JSON.stringify(payload));
  return zipSync(entries);
}

const safeKey = (k: string) => !!k && !k.startsWith('/') && !/[\\\0]/.test(k) && !/^[a-zA-Z]:/.test(k) && !k.split('/').some((s) => s === '' || s === '.' || s === '..');
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const invalid = (m: string) => new BackupError('invalid', m);

/** Fully validates the archive without touching anything. */
function parse(archive: Uint8Array): { payload: Payload; files: Record<string, Uint8Array> } {
  let total = 0;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(archive, {
      filter(f) {
        total += f.originalSize;
        if (total > MAX_TOTAL_BYTES) throw new BackupError('too-large', 'Backup is too large');
        return true;
      },
    });
  } catch (e) {
    if (e instanceof BackupError) throw e;
    throw new BackupError('corrupt', 'The backup file is damaged');
  }
  const files: Record<string, Uint8Array> = {};
  for (const [name, bytes] of Object.entries(entries)) {
    if (name === 'data.json' || name.endsWith('/') && bytes.length === 0) continue;
    const key = name.startsWith('files/') ? name.slice(6) : '';
    if (!safeKey(key)) throw invalid(`Unexpected entry: ${name}`);
    files[key] = bytes;
  }
  if (!entries['data.json']) throw new BackupError('corrupt', 'data.json is missing');
  let raw: unknown;
  try {
    raw = JSON.parse(strFromU8(entries['data.json']));
  } catch {
    throw new BackupError('corrupt', 'data.json is not valid JSON');
  }
  if (!isObj(raw) || raw.format !== 1 || !Number.isInteger(raw.schema_version) || !isObj(raw.tables)) throw invalid('Unrecognised backup format');
  if ((raw.schema_version as number) > migrations.length) {
    throw new BackupError('newer-version', 'This backup was made by a newer version of the app');
  }
  for (const [t, rows] of Object.entries(raw.tables)) {
    if (!TABLES[t] || !Array.isArray(rows)) throw invalid(`Unknown table: ${t}`);
    for (const row of rows) {
      if (!isObj(row)) throw invalid(`Bad row in ${t}`);
      for (const [c, v] of Object.entries(row)) {
        if (!TABLES[t].includes(c)) throw invalid(`Unknown column: ${t}.${c}`);
        if (v !== null && typeof v !== 'string' && typeof v !== 'number') throw invalid(`Bad value in ${t}.${c}`);
      }
    }
  }
  const mimes = isObj(raw.file_mimes) ? raw.file_mimes : {};
  return { payload: { ...(raw as unknown as Payload), file_mimes: mimes as Record<string, string> }, files };
}

const deleteAllRows = async (db: SqlDb) => {
  for (const t of [...ORDER].reverse()) await db.run(`delete from ${t}`);
};

/**
 * Validates everything first, then: back up colliding old files, write the new files, replace the rows in one
 * transaction, and only after commit delete the old files that are not in the archive. Any failure restores the old state.
 */
export async function importBackup(db: SqlDb, files: BackupFiles, archive: Uint8Array): Promise<void> {
  const { payload, files: incoming } = parse(archive);
  const oldKeys = await files.list();
  const collided = new Map<string, Uint8Array>();
  for (const k of oldKeys) if (k in incoming) collided.set(k, (await files.read(k)) ?? new Uint8Array());
  const written: string[] = [];
  const rollback = async () => {
    for (const k of written) if (!collided.has(k)) await files.remove(k).catch(() => undefined);
    for (const [k, b] of collided) await files.write(k, b, DEFAULT_MIME).catch(() => undefined);
  };
  try {
    for (const [k, b] of Object.entries(incoming)) {
      written.push(k);
      await files.write(k, b, payload.file_mimes[k] ?? DEFAULT_MIME);
    }
    await db.transaction(async () => {
      await deleteAllRows(db);
      for (const t of ORDER) {
        const cols = TABLES[t];
        for (const row of payload.tables[t] ?? []) {
          const used = cols.filter((c) => c in row);
          await db.run(`insert into ${t} (${used.join(', ')}) values (${used.map(() => '?').join(', ')})`, used.map((c) => row[c] as SqlParam));
        }
      }
    });
  } catch (e) {
    await rollback();
    if (e instanceof BackupError) throw e;
    throw invalid(`Backup data was rejected: ${(e as Error).message}`);
  }
  for (const k of oldKeys) if (!(k in incoming)) await files.remove(k).catch(() => undefined);
}

/** Deletes every row, then every file (an orphan file after a failed delete is harmless; a row without its file is not). */
export async function wipeAllLocalData(db: SqlDb, files: BackupFiles): Promise<void> {
  await db.transaction(() => deleteAllRows(db));
  for (const k of await files.list()) await files.remove(k);
}
