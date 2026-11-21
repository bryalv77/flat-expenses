// Regenerates landing/img/<lang>/*.webp: node scripts/capture-landing.mjs [en|es] (needs `node e2e/serve.mjs .e2e-dist 8099` running on a fresh web export).
import { chromium, devices } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The app picks its UI language from the browser locale, so the selectors below are the app's own strings per language.
const lang = process.argv[2] ?? 'en';
const T = {
  en: { locale: 'en-US', flat: 'Flat name', create: 'Create flat', tabs: ['Overview', 'Expenses', 'Reports', 'Flat', 'Profile'], guest: 'Add roommate without account', name: 'Name', save: 'Save',
    addBill: /Add bill$/, amount: 'Amount', date: 'Charge date', snooze: 'Remind me in 7 days', edit: 'Edit profile', cats: { Rent: 'Rent', Electricity: 'Electricity', Internet: 'Internet', Phone: 'Phone', Netflix: 'Netflix', Cleaning: 'Cleaning', Gas: 'Gas', Water: 'Water' }, dec: '.' },
  es: { locale: 'es-ES', flat: 'Nombre del piso', create: 'Crear piso', tabs: ['Resumen', 'Gastos', 'Informes', 'Piso', 'Perfil'], guest: 'Añadir roommie sin cuenta', name: 'Nombre', save: 'Guardar',
    addBill: /Añadir factura$/, amount: 'Importe', date: 'Fecha de cobro', snooze: 'Recordar en 7 días', edit: 'Editar perfil', cats: { Rent: 'Alquiler', Electricity: 'Luz', Internet: 'Internet', Phone: 'Teléfono', Netflix: 'Netflix', Cleaning: 'Limpieza', Gas: 'Gas', Water: 'Agua' }, dec: ',' },
}[lang];
const [OVERVIEW, EXPENSES, REPORTS, FLAT, PROFILE] = T.tabs;
const num = (n) => String(n).replace('.', T.dec);
mkdirSync(`landing/img/${lang}`, { recursive: true });
const out = mkdtempSync(join(tmpdir(), 'landing-'));
const b = await chromium.launch();
const page = await (await b.newContext({ ...devices['iPhone 14'], viewport: { width: 390, height: 844 }, locale: T.locale, colorScheme: 'light', baseURL: 'http://localhost:8099' })).newPage();
const btn = (n, exact = true) => page.getByRole('button', { name: n, exact });
const tab = (n) => page.getByRole('tab', { name: n }).click();
const save = async (n = T.save) => { await btn(n).click(); await page.waitForTimeout(900); };
const iso = (m, d) => { const t = new Date(); t.setDate(1); t.setMonth(t.getMonth() - m); t.setDate(d); return t.toISOString().slice(0, 10); };

await page.goto('/');
await page.getByLabel(T.flat).fill('Casa Alameda');
await btn(T.create).click();
await page.getByRole('tab', { name: OVERVIEW }).waitFor();
for (const n of ['Ana', 'Marco', 'Lucía']) {
  await tab(FLAT); await btn(T.guest).click();
  await page.getByRole('textbox', { name: T.name, exact: true }).fill(n); await save();
}
// Seasonal electricity/gas so the year chart has a story; the other categories give the donut real slices.
// Index = months ago (0 = this month). Winter heating peaks in Jan; gas is heating-only, water quarterly.
const lu = [96, 78, 66, 62, 58, 64, 72, 88, 104, 128, 142, 121];
const gas = { 0: 41.2, 8: 58.4, 9: 66.1, 10: 72.3, 11: 61.5 };
const water = { 0: 47.9, 3: 52.4, 6: 49.3, 9: 55.1 };
for (let m = 11; m >= 0; m--) {
  const bills = [['Rent', '1200', 1], ['Electricity', String(lu[m]), 8], ['Internet', '39.90', 12], ['Phone', '24.90', 15], ['Netflix', '15', 18], ['Cleaning', '60', 22]];
  if (gas[m]) bills.push(['Gas', String(gas[m]), 10]);
  if (water[m]) bills.push(['Water', String(water[m]), 20]);
  for (const [cat, amt, day] of bills) {
    console.log(`bill ${cat} ${iso(m, day)}`);
    await tab(OVERVIEW); await btn(T.addBill).click();
    await btn(new RegExp(`${T.cats[cat]}$`)).click();
    await page.getByRole('textbox', { name: T.amount, exact: true }).fill(num(amt));
    await page.getByRole('textbox', { name: T.date, exact: true }).fill(iso(m, day));
    await save();
  }
}
// A real-looking name instead of the default "Roommie".
await tab(PROFILE); await btn(T.edit).click();
await page.getByRole('textbox', { name: T.name, exact: true }).fill('Sofía'); await save();
await page.waitForTimeout(1500); await page.goto('/'); await page.getByRole('tab', { name: OVERVIEW }).waitFor();
await tab(OVERVIEW); await page.getByText(T.snooze).click().catch(() => {});
const scrollTo = (y) => page.evaluate((y) => document.querySelectorAll('*').forEach((e) => { if (e.scrollHeight > e.clientHeight + 20 && /auto|scroll/.test(getComputedStyle(e).overflowY)) e.scrollTop = y; }), y);
// Offsets keep the collapsed iOS header from slicing through a card.
const shot = async (n, y = 0) => { await page.waitForTimeout(4200); await scrollTo(y); await page.waitForTimeout(500); const f = join(out, `${n}.png`); await page.screenshot({ path: f }); execFileSync('cwebp', ['-q', '82', '-resize', '780', '0', f, '-o', `landing/img/${lang}/${n}.webp`], { stdio: 'ignore' }); };
await tab(OVERVIEW); await shot('overview'); await shot('overview2', 395);
await tab(EXPENSES); await shot('expenses');
await tab(REPORTS); await shot('reports2', 240);
await tab(FLAT); await shot('flat');
await b.close();
console.log('done', out);
