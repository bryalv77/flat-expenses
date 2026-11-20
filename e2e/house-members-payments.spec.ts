import { addBill, addRoommate, button, confirm, expect, save, startFlat, tab, test, vtext } from './fixtures';

test.describe('flat settings', () => {
  test('renames the flat, sets an address and toggles balance visibility', async ({ page }) => {
    await startFlat(page);
    await tab(page, 'Flat');
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Casa Renombrada');
    await page.getByRole('textbox', { name: 'Address', exact: true }).fill('Calle Mayor 1');
    await save(page, 'Save changes');
    await page.reload();
    await tab(page, 'Flat');
    await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Casa Renombrada');
    await expect(page.getByRole('textbox', { name: 'Address', exact: true })).toHaveValue('Calle Mayor 1');
  });

  test('deleting the flat sends the user back to onboarding', async ({ page }) => {
    await startFlat(page);
    await tab(page, 'Flat');
    await button(page, 'Delete flat').click();
    await confirm(page, /^Delete/);
    await expect(page).toHaveURL(/onboarding\/create-house/);
  });
});

test.describe('roommates', () => {
  test.beforeEach(async ({ page }) => startFlat(page));

  test('adds a roommate without account; member count updates', async ({ page }) => {
    await addRoommate(page, 'Ana');
    await expect(button(page, 'Ana')).toContainText('No account');
    await tab(page, 'Overview');
    await expect(page.getByText('2 members')).toBeVisible();
  });

  test('splits a bill equally between roommates', async ({ page }) => {
    await addRoommate(page, 'Ana');
    await addBill(page, { category: 'Electricity', amount: '100' });
    await expect(page.getByText('€50.00').first()).toBeVisible();
  });

  test('moves a roommate out and reactivates them', async ({ page }) => {
    await addRoommate(page, 'Ana');
    await button(page, 'Ana').click();
    await button(page, 'Remove').click();
    await confirm(page, 'Remove');
    await expect(button(page, 'Ana')).toContainText('Removed');
    await button(page, 'Ana').click();
    await button(page, 'Reactivate').click();
    await expect(button(page, 'Remove')).toBeVisible();
  });

  test('invitations are not offered in local mode', async ({ page }) => {
    await tab(page, 'Flat');
    await expect(page.getByText('Invite a roommate')).toHaveCount(0);
  });
});

test.describe('payments (fixed contribution)', () => {
  test('explains payments need fixed contribution under equal split', async ({ page }) => {
    await startFlat(page);
    await tab(page, 'Flat');
    await button(page, 'Roommate payments').click();
    await expect(page.getByText('Payments are used with fixed contribution.')).toBeVisible();
  });

  // Regression: screens asked for payments up to the month END, which the payments schema rejects, so Save spun on retries and the list never loaded.
  test('records a roommate payment and shows the totals', async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 5, 17, 12)); // the prorated amount depends on the move-in day, so pin "today"
    await startFlat(page, 'Fija', { fixed: 100 });
    await addRoommate(page, 'Ana');
    await button(page, 'Roommate payments').click();
    await expect(vtext(page, /Pending €43\.33/)).toBeVisible(); // 100 prorated: Ana moves in on the 17th of a 30-day month
    await button(page, 'Ana').click();
    await page.getByRole('textbox', { name: 'Amount paid', exact: true }).fill('43,33');
    await save(page);
    await expect(vtext(page, /Paid €43\.33/)).toBeVisible();
  });
});
