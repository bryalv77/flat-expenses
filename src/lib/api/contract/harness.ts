import type { Api, CategoryInput } from '../types';

/**
 * Builds a fresh backend for one test. `adminProtected` is optional harness info: true when the backend refuses to
 * remove an ADMIN member (the local backend does; the Worker does not, see houses.contract.ts), so that test only
 * asserts where it holds.
 * Assumption: attachments are not exercised with real files (the Worker verifies each object exists in R2), so the
 * contract needs no FileStore; it only checks the "<= 5 files" limit.
 */
export type ApiFactory = () => Promise<{ api: Api; cleanup(): Promise<void>; adminProtected?: boolean }>;

export interface Ctx {
  api: Api;
  adminProtected: boolean;
  houses: string[];
}

export const uuid = (): string => crypto.randomUUID();
export const guestId = (): string => `guest_${uuid().replace(/-/g, '')}`;
export const today = (): string => new Date().toISOString().slice(0, 10);

/** Registers beforeEach/afterEach for the current describe; the backend may be shared, so tests never assume it is empty. */
export function useApi(make: ApiFactory): Ctx {
  const ctx: Ctx = { api: undefined as unknown as Api, adminProtected: false, houses: [] };
  let cleanup: () => Promise<void> = async () => undefined;
  beforeEach(async () => {
    const h = await make();
    ctx.api = h.api;
    ctx.adminProtected = h.adminProtected ?? false;
    ctx.houses = [];
    cleanup = h.cleanup;
  });
  afterEach(async () => {
    for (const id of ctx.houses) await ctx.api.deleteHouse({ houseId: id }).catch(() => undefined);
    await cleanup();
  });
  return ctx;
}

export async function newHouse(ctx: Ctx, extra: Partial<Parameters<Api['createHouse']>[0]> = {}): Promise<string> {
  const id = uuid();
  await ctx.api.createHouse({ id, name: 'Piso', ...extra });
  ctx.houses.push(id);
  return id;
}

export const categoryInput = (over: Partial<CategoryInput> = {}): CategoryInput => ({
  name: 'Luz',
  icon: 'bolt',
  color: '#FFAA00',
  amountType: 'VARIABLE',
  intervalUnit: 'MONTH',
  intervalCount: 1,
  anchorDate: '2026-01-01',
  ...over,
});

export async function newCategory(ctx: Ctx, houseId: string, over: Partial<CategoryInput> = {}): Promise<string> {
  const id = uuid();
  await ctx.api.createCategory({ houseId, id, ...categoryInput(over) });
  return id;
}
