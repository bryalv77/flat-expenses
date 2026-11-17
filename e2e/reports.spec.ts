import { button, expect, startFlat, addBill, tab, test } from './fixtures';

test.describe('reports', () => {
  test('shows "no data" before any bill', async ({ page }) => {
    await startFlat(page);
    await tab(page, 'Reports');
    await expect(page.getByText('No data yet').first()).toBeVisible();
  });

  test('every report section renders with bills and the numbers add up', async ({ page }) => {
    await startFlat(page);
    await addBill(page, { category: 'Luz', amount: '60' });
    await addBill(page, { category: 'Gas', amount: '40' });
    await tab(page, 'Reports');

    await expect(page.getByText(/Total spent/)).toBeVisible();
    await expect(page.getByRole('heading', { name: /NOVEMBER 2026 · €100\.00/i })).toBeVisible();

    await button(page, 'You vs roommates').click();
    await expect(button(page, 'All time')).toBeVisible();
    await button(page, 'Category').click();
    await expect(button(page, /Luz$/)).toBeVisible();
    await button(page, 'Seasonality').click();
    await expect(button(page, 'All')).toBeVisible();
    await button(page, 'Lookup').click();
    await expect(button(page, 'All')).toBeVisible();
    await button(page, 'Forecast').click();
    await expect(page.getByText(/Expected total/)).toBeVisible();
    await button(page, 'People').click();
    await expect(page.getByRole('heading', { name: 'EQUAL SPLIT' })).toBeVisible();
    await expect(page.getByText(/Roommie: €100\.00/).first()).toBeVisible();
  });

  test('exports the bills as CSV', async ({ page }) => {
    await startFlat(page);
    await addBill(page, { category: 'Luz', amount: '60' });
    await tab(page, 'Reports');
    const [download] = await Promise.all([page.waitForEvent('download'), button(page, 'Export CSV').first().click()]);
    expect(download.suggestedFilename()).toMatch(/\.csv$/);
  });
});
