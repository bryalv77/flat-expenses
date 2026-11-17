import { expect, test, button, startFlat } from './fixtures';

test.describe('local onboarding', () => {
  test('fresh install goes straight to create-flat (no login, role or join step)', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/onboarding\/create-house/);
    await expect(page.getByText('Create flat').first()).toBeVisible();
    await expect(page.getByText('Join', { exact: false })).toHaveCount(0);
  });

  test('requires a flat name', async ({ page }) => {
    await page.goto('/');
    await button(page, 'Create flat').click();
    await expect(page).toHaveURL(/onboarding\/create-house/);
  });

  test('creates the flat with suggested categories and lands on overview', async ({ page }) => {
    await startFlat(page, 'Casa Test');
    await expect(page.getByText('Casa Test').first()).toBeVisible();
    await expect(page.getByText('Hi, Roommie')).toBeVisible();
    await expect(page.getByText('UPCOMING CHARGES')).toBeVisible();
    await expect(page.getByText('Alquiler').first()).toBeVisible();
  });

  test('can skip the suggested categories', async ({ page }) => {
    await startFlat(page, 'Sin Categorias', { suggested: false });
    await page.goto('/categories');
    await expect(page.getByText('Alquiler')).toHaveCount(0);
  });

  test('the flat survives a reload (data is on the device)', async ({ page }) => {
    await startFlat(page, 'Persistente');
    await page.reload();
    await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible();
    await expect(page.getByText('Persistente').first()).toBeVisible();
  });
});
