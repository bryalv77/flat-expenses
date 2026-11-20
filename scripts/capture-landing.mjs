// Regenerates landing/img/*.webp: node scripts/capture-landing.mjs (needs `node e2e/serve.mjs .e2e-dist 8099` running on a fresh web export).
import { chromium, devices } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = mkdtempSync(join(tmpdir(), 'landing-'));
const b = await chromium.launch();
const page = await (await b.newContext({ ...devices['iPhone 14'], viewport: { width: 390, height: 844 }, locale: 'en-US', colorScheme: 'light', baseURL: 'http://localhost:8099' })).newPage();
const btn = (n, exact = true) => page.getByRole('button', { name: n, exact });
const tab = (n) => page.getByRole('tab', { name: n }).click();
const save = async (n = 'Save') => { await btn(n).click(); await page.waitForTimeout(900); };
const iso = (m, d) => { const t = new Date(); t.setDate(1); t.setMonth(t.getMonth() - m); t.setDate(d); return t.toISOString().slice(0, 10); };

await page.goto('/');
await page.getByLabel('Flat name').fill('Casa Alameda');
await btn('Create flat').click();
await page.getByRole('tab', { name: 'Overview' }).waitFor();
for (const n of ['Ana', 'Marco', 'Lucía']) {
  await tab('Flat'); await btn('Add roommate without account').click();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill(n); await save();
}
const lu = [86.4, 112.35, 74.1, 98.2, 131.5, 64.8, 92.3];
for (let m = 6; m >= 0; m--) {
  for (const [cat, amt, day] of [['Rent', '1200', 1], ['Electricity', String(lu[m]), 8], ['Internet', '39.90', 12]]) {
    await tab('Overview'); await btn(/Add bill$/).click();
    await btn(new RegExp(`${cat}$`)).click();
    await page.getByRole('textbox', { name: 'Amount', exact: true }).fill(amt);
    await page.getByRole('textbox', { name: 'Charge date', exact: true }).fill(iso(m, day));
    await save();
  }
}
await tab('Overview'); await page.getByText('Remind me in 7 days').click().catch(() => {});
const scrollTo = (y) => page.evaluate((y) => document.querySelectorAll('*').forEach((e) => { if (e.scrollHeight > e.clientHeight + 20 && /auto|scroll/.test(getComputedStyle(e).overflowY)) e.scrollTop = y; }), y);
// Offsets keep the collapsed iOS header from slicing through a card.
const shot = async (n, y = 0) => { await page.waitForTimeout(4200); await scrollTo(y); await page.waitForTimeout(500); const f = join(out, `${n}.png`); await page.screenshot({ path: f }); execFileSync('cwebp', ['-q', '82', '-resize', '780', '0', f, '-o', `landing/img/${n}.webp`], { stdio: 'ignore' }); };
await tab('Overview'); await shot('overview'); await shot('overview2', 395);
await tab('Expenses'); await shot('expenses');
await tab('Reports'); await shot('reports2', 240);
await tab('Flat'); await shot('flat');
await b.close();
console.log('done', out);
