import { readFileSync } from 'node:fs';
import { confirm, expect, test, button, startFlat, addBill, open, tab, save } from './fixtures';

test.describe('profile', () => {
  test.beforeEach(async ({ page }) => startFlat(page));

  test('shows the local-mode notice and edits the display name', async ({ page }) => {
    await tab(page, 'Profile');
    await expect(page.getByText(/Local mode: your data lives only on this device/)).toBeVisible();
    await button(page, 'Edit profile').click();
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Bryan');
    await save(page);
    await button(page, 'Back').click();
    await expect(page.getByText('Bryan').first()).toBeVisible();
  });

  test('export downloads a zip; import restores that snapshot', async ({ page }, info) => {
    await addBill(page, { category: 'Electricity', amount: '10', notes: 'antes' });
    await tab(page, 'Profile');
    const [download] = await Promise.all([page.waitForEvent('download'), button(page, 'Export data').click()]);
    expect(download.suggestedFilename()).toMatch(/^costos-backup-\d{4}-\d{2}-\d{2}\.zip$/);
    const zip = info.outputPath('backup.zip');
    await download.saveAs(zip);
    expect(readFileSync(zip).subarray(0, 2).toString()).toBe('PK');

    await addBill(page, { category: 'Gas', amount: '99', notes: 'despues' });
    await tab(page, 'Profile');
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), button(page, 'Import data').click()]);
    await chooser.setFiles(zip);
    await confirm(page, 'Restore');
    await tab(page, 'Expenses');
    await expect(page.getByText(/antes/)).toBeVisible();
    await expect(page.getByText('despues')).toHaveCount(0);
  });

  test('importing a file that is not a backup is rejected without touching data', async ({ page }, info) => {
    const { writeFileSync } = await import('node:fs');
    const bad = info.outputPath('bad.zip');
    writeFileSync(bad, 'not a zip');
    await tab(page, 'Profile');
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), button(page, 'Import data').click()]);
    await chooser.setFiles(bad);
    await confirm(page, 'Restore'); // the file is only validated once the user confirms
    await expect(page.getByText('This file is not a valid backup.').first()).toBeVisible();
    await tab(page, 'Flat');
    await expect(page.getByText('Casa Test').first()).toBeVisible();
  });

  test('delete all data wipes the device and restarts onboarding', async ({ page }) => {
    await tab(page, 'Profile');
    await button(page, 'Delete all data').click();
    await confirm(page, 'Delete all data');
    await expect(page).toHaveURL(/onboarding\/create-house/);
  });
});

test.describe('settings', () => {
  test.beforeEach(async ({ page }) => startFlat(page));

  test('language switch translates the UI and is remembered after reload', async ({ page }) => {
    await page.goto('/settings');
    await page.getByText('Español', { exact: true }).click();
    await expect(page.getByText('APARIENCIA')).toBeVisible();
    await page.reload();
    await expect(page.getByText('APARIENCIA')).toBeVisible();
    await page.getByText('English', { exact: true }).click();
    await expect(page.getByText('APPEARANCE')).toBeVisible();
  });
});
