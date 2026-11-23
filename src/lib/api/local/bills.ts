import { z } from 'zod';

import type { Bill, BillFile } from '@/types/domain';

import { zCreateBillBody, zUpdateBillBody } from '../generated/zod.gen';
import type { Api } from '../types';
import { MAX_BILL_FILES, MAX_LIST } from '../../limits';
import type { LocalCtx } from './ctx';
import type { SqlParam } from './sql';

// Local files are referenced by `storagePath` (the wire's `objectKey`) and ids are not necessarily uuids.
const fileRef = z.object({
  storagePath: z.string().min(1).max(300),
  fileName: z.string().min(1).max(150),
  mimeType: z.string().max(100),
  sizeBytes: z.number().int().min(0),
});
const files = z.array(fileRef).max(MAX_BILL_FILES);
const createSchema = zCreateBillBody.extend({ id: z.string().optional(), files: files.optional(), categoryId: z.string().min(1) });
const updateSchema = zUpdateBillBody.extend({ files: files.optional(), categoryId: z.string().min(1).optional() });

interface BillRow {
  id: string; category_id: string; amount_cents: number; charge_date: string | null;
  period_start_date: string | null; period_end_date: string | null; notes: string | null;
  ocr_status: Bill['ocrStatus']; ocr_data: string | null; created_at: string;
}
interface FileRow { bill_id: string; path: string; file_name: string; mime_type: string; size_bytes: number }

// Patchable bill columns, by input key.
const COLUMNS = {
  categoryId: 'category_id', amountCents: 'amount_cents', chargeDate: 'charge_date',
  periodStartDate: 'period_start_date', periodEndDate: 'period_end_date', notes: 'notes',
} as const;

export function makeBillsApi(ctx: LocalCtx): Partial<Api> {
  const { db } = ctx;
  // Files are not transactional: delete only after commit; a failure leaves orphans that sweepOrphanFiles collects.
  const dropFiles = async (paths: string[]) => {
    if (paths.length) await ctx.deleteFiles(paths).catch(() => undefined);
  };

  const hydrate = async (rows: BillRow[]): Promise<Bill[]> => {
    if (!rows.length) return [];
    const files = await db.all<FileRow>(
      `select bill_id, path, file_name, mime_type, size_bytes from bill_files
       where bill_id in (${rows.map(() => '?').join(',')}) order by position`,
      rows.map((r) => r.id),
    );
    return rows.map((r) => ({
      id: r.id,
      categoryId: r.category_id,
      amountCents: r.amount_cents,
      chargeDate: r.charge_date,
      periodStartDate: r.period_start_date,
      periodEndDate: r.period_end_date,
      files: files.filter((f) => f.bill_id === r.id)
        .map((f) => ({ storagePath: f.path, fileName: f.file_name, mimeType: f.mime_type, sizeBytes: f.size_bytes })),
      notes: r.notes,
      ocrStatus: r.ocr_status,
      ocrData: r.ocr_data === null ? null : JSON.parse(r.ocr_data),
      createdAt: r.created_at,
    }));
  };

  // The FK alone would accept a category of another house.
  const assertCategory = async (houseId: string, categoryId: string) => {
    if (!(await db.get('select 1 as x from categories where id = ? and house_id = ?', [categoryId, houseId]))) {
      throw new Error('Category not found');
    }
  };
  const insertFiles = async (billId: string, files: BillFile[]) => {
    for (const [i, f] of files.entries()) {
      await db.run(
        'insert into bill_files (id, bill_id, path, file_name, mime_type, size_bytes, position) values (?,?,?,?,?,?,?)',
        [`${billId}:${i}`, billId, f.storagePath, f.fileName, f.mimeType, f.sizeBytes, i],
      );
    }
  };
  const pathsOf = async (billId: string) =>
    (await db.all<{ path: string }>('select path from bill_files where bill_id = ?', [billId])).map((r) => r.path);

  return {
    createBill: async (v) => {
      const b = createSchema.parse(v);
      await db.transaction(async () => {
        await assertCategory(v.houseId, b.categoryId);
        const now = ctx.now();
        await db.run(
          `insert into bills (id, house_id, category_id, amount_cents, charge_date, period_start_date, period_end_date,
             notes, created_by, created_at, updated_at) values (?,?,?,?,?,?,?,?,?,?,?)`,
          [v.id, v.houseId, b.categoryId, b.amountCents, b.chargeDate ?? null, b.periodStartDate ?? null,
            b.periodEndDate ?? null, b.notes ?? null, ctx.userId, now, now],
        );
        await insertFiles(v.id, b.files ?? []);
      });
    },

    updateBill: async ({ houseId, id, ...rest }) => {
      const b = updateSchema.parse(rest);
      let removed: string[] = [];
      await db.transaction(async () => {
        if (!(await db.get('select 1 as x from bills where id = ? and house_id = ?', [id, houseId]))) {
          throw new Error('Bill not found');
        }
        if (b.categoryId !== undefined) await assertCategory(houseId, b.categoryId);
        const keys = (Object.keys(COLUMNS) as (keyof typeof COLUMNS)[]).filter((k) => b[k] !== undefined);
        await db.run(
          `update bills set ${[...keys.map((k) => `${COLUMNS[k]} = ?`), 'updated_at = ?'].join(', ')} where id = ? and house_id = ?`,
          [...keys.map((k) => b[k] as SqlParam), ctx.now(), id, houseId],
        );
        if (b.files) {
          const before = await pathsOf(id);
          await db.run('delete from bill_files where bill_id = ?', [id]);
          await insertFiles(id, b.files);
          const kept = new Set(b.files.map((f) => f.storagePath));
          removed = before.filter((p) => !kept.has(p));
        }
      });
      await dropFiles(removed);
    },

    deleteBill: async ({ houseId, id }) => {
      let paths: string[] = [];
      await db.transaction(async () => {
        const found = await db.get('select 1 as x from bills where id = ? and house_id = ?', [id, houseId]);
        paths = found ? await pathsOf(id) : [];
        await db.run('delete from bills where id = ? and house_id = ?', [id, houseId]); // bill_files cascade
      });
      await dropFiles(paths);
    },

    getBill: async ({ houseId, id }) =>
      (await hydrate(await db.all<BillRow>('select * from bills where id = ? and house_id = ?', [id, houseId])))[0] ?? null,

    listBills: async ({ houseId, from, to, categoryId }) =>
      hydrate(
        await db.all<BillRow>(
          `select * from bills where house_id = ? and effective_date between ? and ?
           ${categoryId ? 'and category_id = ?' : ''} order by effective_date desc, created_at desc limit ${MAX_LIST}`,
          categoryId ? [houseId, from, to, categoryId] : [houseId, from, to],
        ),
      ),
  };
}

/**
 * Deletes files on disk that no bill_files row references (crash between commit and file delete, failed uploads).
 * Call at startup. Returns the deleted paths.
 * shortcut: an uploaded file whose bill is not saved yet looks orphaned, so run it only before the UI is usable.
 */
export async function sweepOrphanFiles(ctx: Pick<LocalCtx, 'db' | 'deleteFiles'>, listFiles: () => Promise<string[]>): Promise<string[]> {
  const referenced = new Set((await ctx.db.all<{ path: string }>('select path from bill_files')).map((r) => r.path));
  const orphans = (await listFiles()).filter((p) => !referenced.has(p));
  if (orphans.length) await ctx.deleteFiles(orphans);
  return orphans;
}
