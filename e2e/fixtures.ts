import { expect, test as base, type Locator, type Page } from '@playwright/test';

/** Every test fails on uncaught page errors, which is what surfaced the `localApi.then` NotImplementedError. */
export const test = base.extend<{ errors: string[] }>({
  errors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error' && /NotImplemented/.test(m.text())) errors.push(m.text());
      });
      await use(errors);
      expect(errors, 'uncaught page errors').toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

/** Today as YYYY-MM-DD in the browser's local time (matches the app's `todayISO`). */
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Current month as the app's English section header shows it, e.g. `NOVEMBER 2026`. */
export const thisMonthLabel = () => new Date().toLocaleString('en', { month: 'long', year: 'numeric' }).toUpperCase();

/** Expo Router keeps previous screens mounted but hidden: only role queries ignore those, so prefer them. */
export const button = (page: Page, name: string | RegExp, exact = true): Locator => page.getByRole('button', { name, exact });

/** Expo Router keeps previous screens mounted: getByText also matches those hidden copies. */
export const vtext = (page: Page, text: string | RegExp) => page.getByText(text).locator('visible=true').first();

export const tab = (page: Page, name: string) => page.getByRole('tab', { name }).click();

/** Fresh browser context = empty OPFS database, so every test starts at local onboarding. */
export async function startFlat(page: Page, name = 'Casa Test', opts: { suggested?: boolean; fixed?: number } = {}) {
  await page.goto('/');
  await expect(page).toHaveURL(/onboarding\/create-house/);
  await page.getByLabel('Flat name').fill(name);
  if (opts.suggested === false) await page.getByRole('switch', { name: 'Create suggested categories' }).click({ force: true }); // RN-web renders the switch input disabled
  if (opts.fixed !== undefined) {
    await page.getByText('Fixed contribution').click();
    await page.getByRole('textbox', { name: 'Monthly contribution per roommate' }).fill(String(opts.fixed));
  }
  await button(page, 'Create flat').click();
  await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible();
}

/** Through the UI (Overview > Add bill): a deep link would leave `router.back()` with nowhere to go after saving. */
export async function addBill(page: Page, o: { category: string; amount: string; date?: string; notes?: string }) {
  await tab(page, 'Overview');
  await button(page, /Add bill$/).click();
  await button(page, new RegExp(`${o.category}$`)).click(); // the chip label is preceded by an icon glyph
  await page.getByRole('textbox', { name: 'Amount', exact: true }).fill(o.amount);
  await page.getByRole('textbox', { name: 'Charge date', exact: true }).fill(o.date ?? today());
  if (o.notes) await page.getByRole('textbox', { name: 'Notes', exact: true }).first().fill(o.notes);
  await save(page);
  await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible();
}

export async function addRoommate(page: Page, name: string) {
  await tab(page, 'Flat');
  await button(page, 'Add roommate without account').click();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
  await save(page);
  await expect(page.getByRole('tab', { name: 'Flat' })).toBeVisible();
}

export async function openCategories(page: Page) {
  await tab(page, 'Flat');
  await button(page, 'Expense categories').click();
  await expect(page.getByRole('heading', { name: 'Categories' })).toBeVisible();
}

/** Click a save button and wait until the form is done (navigated away, or a "saved" toast showed). A goto right after would abort the write. */
export async function save(page: Page, name = 'Save') {
  await button(page, name).click();
  await expect.poll(async () => !(await button(page, name).isVisible()) || (await page.getByText(/^(Saved|Profile updated)$/).first().isVisible())).toBe(true);
}

/** Destructive confirmations render as a dialog (ActionSheet). */
export const confirm = (page: Page, label: string | RegExp) => page.getByRole('dialog').getByRole('button', { name: label, exact: typeof label === 'string' }).click();

/** Reload keeps the OPFS database; navigating with goto is a full reload in this static web build. */
export const open = async (page: Page, path: string) => {
  await page.goto(path);
  await expect(page.getByRole('heading').first()).toBeVisible();
};
