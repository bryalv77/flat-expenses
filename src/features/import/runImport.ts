/**
 * One-off importer for the historical Excel (see scripts/extract-excel.py + scripts/prepare-import-bundle.py).
 * Runs inside the app so every write goes through the normal client + security rules. Re-runnable: deterministic
 * ids / name matches make existing items be skipped.
 */
import { api } from '@/lib/db';
import { newId, storagePaths, uploadFile } from '@/lib/storage';

interface BundleBill {
  id: string; row: number; label: string; category: string; amount: number; fileLabel: string | null;
  debitDate: string | null; bank: string | null;
  file: { path: string; name: string; mime: string; size: number } | null;
}
interface BundleSheet { sheet: string; month: string; bills: BundleBill[]; people: { name: string; paid: number; rent: number | null }[] }

const CATEGORIES = [
  { name: 'Alquiler', icon: 'home', color: '#007AFF', amountType: 'FIXED' as const },
  { name: 'Luz', icon: 'bolt', color: '#FF9500', amountType: 'VARIABLE' as const },
  { name: 'Internet', icon: 'wifi', color: '#5856D6', amountType: 'FIXED' as const },
  { name: 'Teléfono', icon: 'phone', color: '#34C759', amountType: 'VARIABLE' as const },
  { name: 'Gas', icon: 'flame', color: '#FF3B30', amountType: 'VARIABLE' as const },
  { name: 'Limpieza', icon: 'sparkles', color: '#5AC8FA', amountType: 'VARIABLE' as const },
  { name: 'Agua', icon: 'drop', color: '#32ADE6', amountType: 'VARIABLE' as const },
];

const cents = (eur: number) => Math.round(eur * 100);
const lastDay = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
};
// Rules need 12+ alphanumerics after `guest_`; keep ids for longer names unchanged (already imported).
const guestId = (name: string) => `guest_${`xl${name.toLowerCase().replace(/[^a-z0-9]/g, '')}000000`.padEnd(12, '0')}`;

async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

export async function runImport(opts: { bundleUrl: string; houseName: string; log: (line: string) => void }): Promise<void> {
  const { bundleUrl, houseName, log } = opts;
  const data: BundleSheet[] = await (await fetch(`${bundleUrl}/data.json`)).json();
  const months = data.map((s) => s.month);
  const [first, last] = [months[0], months[months.length - 1]];
  log(`${data.length} meses (${first} → ${last})`);

  const houses = await api.listMyHouses();
  let house = houses.find((h) => h.name === houseName);
  let houseId = house?.id;
  if (!houseId) {
    houseId = newId();
    await api.createHouse({ id: houseId, name: houseName, splitMode: 'FIXED_CONTRIBUTION', showBalanceToRoommates: true });
    log(`Casa creada: ${houseName}`);
  } else log(`Usando casa existente: ${houseName} (${houseId}) — tu rol: ${house?.role}`);

  const cats = await api.listCategories({ houseId });
  const catId: Record<string, string> = {};
  for (const [sortOrder, c] of CATEGORIES.entries()) {
    const found = cats.find((x) => x.name === c.name);
    if (found) { catId[c.name] = found.id; continue; }
    const id = newId();
    await api.createCategory({ ...c, houseId, id, expectedAmountCents: null, intervalUnit: 'MONTH', intervalCount: 1, anchorDate: `${first}-01`, sortOrder });
    catId[c.name] = id;
  }
  log(`Categorías listas (${CATEGORIES.length})`);

  const people = new Map<string, { first: string; last: string; rent: number | null }>();
  for (const s of data) for (const p of s.people) {
    const g = people.get(p.name) ?? { first: s.month, last: s.month, rent: null };
    g.last = s.month;
    if (p.rent) g.rent = p.rent;
    people.set(p.name, g);
  }
  const haveMembers = new Set((await api.listMembers({ houseId })).map((m) => m.id));
  for (const [name, g] of people) {
    if (haveMembers.has(guestId(name))) continue;
    try {
      await api.createGuestMember({
        houseId, id: guestId(name), displayName: name, joinedAt: `${g.first}-01`,
        removedAt: g.last === last ? null : lastDay(g.last), individualContributionCents: g.rent ? cents(g.rent) : null,
      });
    } catch (e) {
      throw new Error(`crear roommie ${name} (${guestId(name)}): ${String(e)}`);
    }
  }
  log(`Roommies registrados: ${[...people.keys()].join(', ')}`);

  const haveBills = new Set((await api.listBills({ houseId, from: '2000-01-01', to: '2100-01-01' })).map((b) => b.id));
  const bills = data.flatMap((s) => s.bills.filter((b) => b.amount > 0).map((b) => ({ ...b, month: s.month })));
  const stats = { created: 0, skipped: 0, withFile: 0, withoutFile: 0 };
  await pool(bills, 4, async (b) => {
    if (haveBills.has(b.id)) { stats.skipped++; return; }
    let fileFields = {};
    if (b.file) {
      try {
        const up = await uploadFile(storagePaths.bill(houseId, b.id, b.file.name), { uri: `${bundleUrl}/${b.file.path}`, name: b.file.name, mimeType: b.file.mime });
        fileFields = { fileStoragePath: up.storagePath, fileName: up.fileName, fileMimeType: up.mimeType, fileSizeBytes: up.sizeBytes };
        stats.withFile++;
      } catch (e) {
        log(`⚠ no se pudo subir ${b.file.name}: ${String(e)}`);
        stats.withoutFile++;
      }
    } else stats.withoutFile++;
    const notes = [b.label !== b.category ? b.label : null, b.bank, b.debitDate ? `Débito ${b.debitDate}` : null, !('fileStoragePath' in fileFields) && b.fileLabel ? `Recibo: ${b.fileLabel}` : null]
      .filter(Boolean).join(' · ').slice(0, 1000) || null;
    await api.createBill({
      houseId, id: b.id, categoryId: catId[b.category], amountCents: cents(b.amount), chargeDate: null,
      periodStartDate: `${b.month}-01`, periodEndDate: lastDay(b.month), notes, ...fileFields,
    });
    stats.created++;
    if (stats.created % 25 === 0) log(`… ${stats.created} gastos`);
  });
  log(`Gastos: ${stats.created} creados, ${stats.skipped} ya existían · ${stats.withFile} con recibo, ${stats.withoutFile} sin recibo`);

  const havePayments = new Set((await api.listPayments({ houseId, from: '2000-01-01', to: '2100-12-01' })).map((p) => p.id));
  let np = 0;
  for (const s of data) for (const p of s.people.filter((x) => x.paid > 0)) {
    const id = `xl-${s.month}-${guestId(p.name).slice(8, 18)}`;
    if (havePayments.has(id)) continue;
    await api.recordPayment({ houseId, id, memberId: guestId(p.name), month: `${s.month}-01`, amountCents: cents(p.paid), note: null });
    np++;
  }
  log(`Pagos creados: ${np}`);
  log('✔ Importación terminada');
}
