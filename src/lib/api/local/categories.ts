import { z } from 'zod';

import type { ExpenseCategory } from '@/types/domain';
import { normalizeIconName } from '../../iconAliases';
import type { Api } from '../types';
import type { LocalCtx } from './ctx';

// Same limits as the Worker (worker/src/categories.ts) and firestore.rules.
const shape = z.object({
  name: z.string().trim().min(1).max(60),
  icon: z.string().min(1).max(40),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  amountType: z.enum(['FIXED', 'VARIABLE']),
  expectedAmountCents: z.number().int().min(0).max(10_000_000).nullable(),
  intervalUnit: z.enum(['DAY', 'WEEK', 'MONTH', 'YEAR']),
  intervalCount: z.number().int().min(1).max(1000),
  anchorDate: z.iso.date(),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0).max(10_000),
  notes: z.string().max(500).nullable(),
});
const fixedNeedsAmount = (v: { amountType?: string; expectedAmountCents?: number | null }) =>
  v.amountType !== 'FIXED' || v.expectedAmountCents != null;
const create = shape
  .partial({ expectedAmountCents: true, isActive: true, sortOrder: true, notes: true })
  .refine(fixedNeedsAmount, 'FIXED categories need expectedAmountCents');
const update = shape.partial();

type Row = {
  id: string; name: string; icon: string; color: string; amount_type: string; expected_amount_cents: number | null;
  interval_unit: string; interval_count: number; anchor_date: string; is_active: number; sort_order: number; notes: string | null;
};
const COLS: Record<string, string> = {
  name: 'name', icon: 'icon', color: 'color', amountType: 'amount_type', expectedAmountCents: 'expected_amount_cents',
  intervalUnit: 'interval_unit', intervalCount: 'interval_count', anchorDate: 'anchor_date', isActive: 'is_active',
  sortOrder: 'sort_order', notes: 'notes',
};
const toCategory = (r: Row): ExpenseCategory => ({
  id: r.id, name: r.name, icon: normalizeIconName(r.icon), color: r.color,
  amountType: r.amount_type as ExpenseCategory['amountType'], expectedAmountCents: r.expected_amount_cents,
  intervalUnit: r.interval_unit as ExpenseCategory['intervalUnit'], intervalCount: r.interval_count,
  anchorDate: r.anchor_date, isActive: r.is_active === 1, sortOrder: r.sort_order, notes: r.notes,
});

export function makeCategoriesApi({ db, now }: LocalCtx): Partial<Api> {
  // Patches the given fields (booleans -> 0/1); throws when the category is not in that house.
  const patch = async (houseId: string, id: string, fields: Record<string, string | number | boolean | null | undefined>) => {
    const keys = Object.keys(fields).filter((k) => fields[k] !== undefined);
    const values = keys.map((k) => {
      const v = fields[k];
      return typeof v === 'boolean' ? Number(v) : (v as string | number | null);
    });
    const sets = [...keys.map((k) => `${COLS[k]} = ?`), 'updated_at = ?'].join(', ');
    const { changes } = await db.run(`update categories set ${sets} where house_id = ? and id = ?`, [...values, now(), houseId, id]);
    if (!changes) throw new Error('not_found');
  };

  return {
    createCategory: async ({ houseId, id, ...input }) => {
      const v = create.parse(input);
      const t = now();
      await db.run(
        `insert into categories (id, house_id, name, icon, color, amount_type, expected_amount_cents, interval_unit,
          interval_count, anchor_date, is_active, sort_order, notes, created_at, updated_at)
         values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id, houseId, v.name, v.icon, v.color, v.amountType, v.expectedAmountCents ?? null, v.intervalUnit,
          v.intervalCount, v.anchorDate, Number(v.isActive ?? true), v.sortOrder ?? 0, v.notes ?? null, t, t],
      );
    },
    updateCategory: async ({ houseId, id, ...rest }) => {
      const v = update.parse(rest);
      const cur = await db.get<Row>('select * from categories where house_id = ? and id = ?', [houseId, id]);
      if (!cur) throw new Error('not_found');
      // The merged result must stay valid (switching to FIXED needs an amount).
      const merged = {
        amountType: v.amountType ?? cur.amount_type,
        expectedAmountCents: v.expectedAmountCents === undefined ? cur.expected_amount_cents : v.expectedAmountCents,
      };
      if (!fixedNeedsAmount(merged)) throw new Error('FIXED categories need expectedAmountCents');
      await patch(houseId, id, v);
    },
    archiveCategory: ({ houseId, id, isActive }) => patch(houseId, id, { isActive }),
    deleteCategory: async ({ houseId, id }) => {
      if (await db.get('select 1 from bills where category_id = ? limit 1', [id])) throw new Error('CATEGORY_HAS_BILLS');
      await db.run('delete from categories where house_id = ? and id = ?', [houseId, id]);
    },
    listCategories: async ({ houseId }) =>
      (await db.all<Row>('select * from categories where house_id = ? order by sort_order, name limit 200', [houseId])).map(toCategory),
    setCategorySortOrder: async ({ houseId, id, sortOrder }) =>
      patch(houseId, id, { sortOrder: shape.shape.sortOrder.parse(sortOrder) }),
  };
}
