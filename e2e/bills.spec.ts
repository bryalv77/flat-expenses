import { addBill, button, confirm, expect, save, startFlat, tab, test, vtext } from './fixtures';

test.describe('bills', () => {
  test.beforeEach(async ({ page }) => startFlat(page));

  test('add a bill: shows in overview total, expenses list and by-category chart', async ({ page }) => {
    await addBill(page, { category: 'Luz', amount: '50,25', notes: 'nota uno' });
    await expect(page.getByText('€50.25').first()).toBeVisible();
    await tab(page, 'Expenses');
    await expect(page.getByRole('button', { name: /^Luz/ })).toContainText('nota uno');
    await expect(page.getByText(/NOVEMBER 2026 · €50\.25/i)).toBeVisible();
  });

  test('empty state before any bill, with a shortcut to create one', async ({ page }) => {
    await tab(page, 'Expenses');
    await expect(page.getByText('No bills yet')).toBeVisible();
    await button(page, 'New bill').first().click();
    await expect(page).toHaveURL(/bills\/new/);
  });

  test('saving without an amount does not create a bill', async ({ page }) => {
    await button(page, /Add bill$/).click();
    await button(page, /Luz$/).click();
    await button(page, 'Save').click();
    await expect(page).toHaveURL(/bills\/new/);
    await expect(button(page, 'Save')).toBeVisible();
  });

  test('search narrows the list', async ({ page }) => {
    await addBill(page, { category: 'Luz', amount: '40', notes: 'enero invierno' });
    await addBill(page, { category: 'Gas', amount: '20', notes: 'bombona' });
    await tab(page, 'Expenses');
    await expect(page.getByRole('button', { name: /^Luz/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Gas/ })).toBeVisible();
    await page.getByRole('textbox', { name: 'Search' }).fill('bombona');
    await expect(page.getByRole('button', { name: /^Luz/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Gas/ })).toBeVisible();
  });

  test('opens a bill, edits it and the new amount is shown', async ({ page }) => {
    await addBill(page, { category: 'Internet', amount: '30' });
    await tab(page, 'Expenses');
    await page.getByRole('button', { name: /^Internet/ }).click();
    await expect(vtext(page, '€30.00')).toBeVisible();
    await button(page, /Edit$/).click();
    await page.getByRole('textbox', { name: 'Amount', exact: true }).fill('35,50');
    await save(page);
    await expect(vtext(page, '€35.50')).toBeVisible();
  });

  test('duplicates a bill', async ({ page }) => {
    await addBill(page, { category: 'Gas', amount: '20' });
    await tab(page, 'Expenses');
    await page.getByRole('button', { name: /^Gas/ }).click();
    await button(page, /Duplicate$/).click();
    await expect(page.getByRole('textbox', { name: 'Amount', exact: true })).toHaveValue(/20/);
  });

  test('deletes a bill from its detail page', async ({ page }) => {
    await addBill(page, { category: 'Agua', amount: '12' });
    await tab(page, 'Expenses');
    await page.getByRole('button', { name: /^Agua/ }).click();
    await button(page, /Delete$/).click();
    await confirm(page, 'Delete');
    await expect(page.getByText('No bills yet')).toBeVisible();
  });
});
