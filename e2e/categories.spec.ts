import { button, confirm, expect, openCategories, save, startFlat, test } from './fixtures';

test.describe('categories', () => {
  test.beforeEach(async ({ page }) => startFlat(page));

  test('lists the suggested categories with their recurrence and amount', async ({ page }) => {
    await openCategories(page);
    await expect(page.getByText('Every month · €1,200.00')).toBeVisible();
    await expect(page.getByText('Every 4 weeks · €15.00')).toBeVisible();
  });

  test('creates a custom category and it becomes available when adding a bill', async ({ page }) => {
    await openCategories(page);
    await button(page, 'New category').click();
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Seguro');
    await page.getByText('Fixed', { exact: true }).click();
    await page.getByRole('textbox', { name: 'Expected amount', exact: true }).fill('25');
    await save(page);
    await expect(button(page, 'Seguro')).toBeVisible();
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByRole('tab', { name: 'Overview' }).click();
    await button(page, /Add bill$/).click();
    await expect(button(page, /Seguro$/)).toBeVisible();
  });

  test('a category can carry per-language names; the viewer sees theirs and the form keeps the stored one', async ({ page }) => {
    await openCategories(page);
    await button(page, 'New category').click();
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Garaje');
    await page.getByRole('textbox', { name: 'English', exact: true }).fill('Garage');
    await save(page);
    await expect(button(page, 'Garage')).toBeVisible();
    await expect(page.getByText('Garaje')).toHaveCount(0);
    await button(page, 'Garage').click();
    await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Garaje');
    await expect(page.getByRole('textbox', { name: 'English', exact: true })).toHaveValue('Garage');
  });

  test('edits a category', async ({ page }) => {
    await openCategories(page);
    await button(page, 'Gas').click();
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Gas natural');
    await save(page);
    await expect(button(page, 'Gas natural')).toBeVisible();
  });

  test('archives, restores and deletes a category', async ({ page }) => {
    await openCategories(page);
    await button(page, 'Netflix').click();
    await button(page, 'Archive').click();
    await expect(button(page, 'Restore')).toBeVisible();
    await button(page, 'Restore').click({ force: true }); // nested inside a pressable row, RN-web marks it disabled
    await expect(button(page, 'Restore')).toHaveCount(0);
    await button(page, 'Netflix').click();
    await button(page, 'Delete category').click();
    await confirm(page, /^Delete/);
    await expect(button(page, 'Netflix')).toHaveCount(0);
  });
});
