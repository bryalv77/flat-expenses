import { confirm, expect, test, button, startFlat, tab } from './fixtures';

// Cloud auth is only reachable from local mode through Profile. The backend is not available in e2e,
// so these cover navigation and client-side validation only (no real sign-in).
test.describe('cloud auth entry', () => {
  test.beforeEach(async ({ page }) => {
    await startFlat(page);
    await tab(page, 'Profile');
    await button(page, 'Log in / Create account').click();
  });

  test('welcome offers create account, sign in and staying local', async ({ page }) => {
    await expect(button(page, 'Create account')).toBeVisible();
    await expect(button(page, 'Sign in')).toBeVisible();
    await expect(button(page, 'Use without an account (this device only)')).toBeVisible();
  });

  test('"use without an account" returns to the app with the data intact', async ({ page }) => {
    await button(page, 'Use without an account (this device only)').click();
    await confirm(page, 'Confirm');
    await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible();
    await expect(page.getByText('Casa Test').first()).toBeVisible();
  });

  test('sign-in validates email and password before calling the server', async ({ page }) => {
    await button(page, 'Sign in').click();
    await expect(page).toHaveURL(/sign-in/);
    await button(page, 'Sign in').last().click();
    await expect(page.getByText('Invalid email')).toBeVisible();
    await expect(page.getByText('At least 6 characters')).toBeVisible();
  });

  test('forgot-password and sign-up screens are reachable from sign-in', async ({ page }) => {
    await button(page, 'Sign in').click();
    await button(page, 'Forgot your password?').click();
    await expect(page).toHaveURL(/forgot-password/);
    await expect(button(page, 'Send link')).toBeVisible();
    await page.goBack();
    await button(page, 'No account yet? Create account').click();
    await expect(page).toHaveURL(/sign-up/);
    await button(page, 'Create account').last().click();
    await expect(page.getByText('Invalid email')).toBeVisible();
  });
});
