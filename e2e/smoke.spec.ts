import { expect, test, startFlat, tab } from './fixtures';

// The `errors` fixture fails the test on any uncaught error, so this walks every screen looking for crashes.
test('navigating every tab and route raises no errors', async ({ page }) => {
  await startFlat(page);
  for (const t of ['Expenses', 'Reports', 'Flat', 'Profile', 'Overview']) {
    await tab(page, t);
    await expect(page.getByRole('tab', { name: t })).toHaveAttribute('aria-selected', 'true');
  }
  for (const path of ['/bills/new', '/categories', '/categories/new', '/members/new', '/payments', '/settings', '/profile/edit', '/profile/documents']) {
    await page.goto(path);
    await expect(page.locator('body')).not.toContainText('Unmatched Route');
    await page.waitForTimeout(300); // lets a render error reach the `errors` fixture before the next goto
  }
});
