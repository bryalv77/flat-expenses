import { addBill, addRoommate, button, confirm, expect, openCategories, save, startFlat, tab, test, today, vtext } from './fixtures';

// 1x1 transparent PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

test.describe('swipe and filters', () => {
  test.use({ hasTouch: true });
  test.beforeEach(async ({ page }) => startFlat(page));

  test('swipe-to-delete in the expenses list removes the bill after confirming', async ({ page }) => {
    await addBill(page, { category: 'Water', amount: '12' });
    await tab(page, 'Expenses');
    const row = page.getByRole('button', { name: /^Water/ });
    const box = (await row.boundingBox())!;
    // The swipe only reacts to touch input (a mouse drag is just a click), so drive it through CDP.
    const cdp = await page.context().newCDPSession(page);
    const y = box.y + box.height / 2;
    const x0 = box.x + box.width - 30;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] });
    for (let i = 1; i <= 15; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 - i * 12, y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await button(page, 'Delete').first().click(); // revealed by the swipe
    await confirm(page, 'Delete');
    await expect(page.getByText('No bills yet')).toBeVisible();
  });

  test('period and category chips filter the expenses list', async ({ page }) => {
    await addBill(page, { category: 'Electricity', amount: '40', notes: 'reciente' });
    await addBill(page, { category: 'Gas', amount: '20', date: '2025-01-15', notes: 'antiguo' });
    await tab(page, 'Expenses');
    await expect(page.getByRole('button', { name: /^Electricity/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Gas/ })).toHaveCount(0); // outside "This month"
    await button(page, 'All', true).first().click();
    await expect(page.getByRole('button', { name: /^Gas/ })).toBeVisible();
    await button(page, /\sElectricity$/).click(); // category chip (icon + label; the list rows are named exactly "Electricity")
    await expect(page.getByRole('button', { name: /^Gas/ })).toHaveCount(0);
  });

  test('reorders categories with the move buttons', async ({ page }) => {
    await openCategories(page);
    const first = () => page.getByRole('button', { name: /^(Rent|Electricity)$/ }).first();
    await expect(first()).toHaveAccessibleName('Rent');
    await button(page, 'Move down').first().click();
    await expect(first()).toHaveAccessibleName('Electricity');
  });
});

test.describe('files', () => {
  test('attaches a file to a bill and it shows on the bill detail', async ({ page }) => {
    await startFlat(page);
    await button(page, /Add bill$/).click();
    await button(page, /Electricity$/).click();
    await page.getByRole('textbox', { name: 'Amount', exact: true }).fill('30');
    await page.getByRole('textbox', { name: 'Charge date', exact: true }).fill(today());
    await page.locator('input[type=file]').setInputFiles({ name: 'factura.png', mimeType: 'image/png', buffer: PNG });
    await expect(vtext(page, 'factura.png')).toBeVisible();
    await save(page);
    await tab(page, 'Expenses');
    await page.getByRole('button', { name: /^Electricity/ }).click();
    await expect(vtext(page, /factura\.jpg/)).toBeVisible();
  });

  test('rejects a file type that is not allowed', async ({ page }) => {
    await startFlat(page);
    await button(page, /Add bill$/).click();
    await page.locator('input[type=file]').setInputFiles({ name: 'virus.exe', mimeType: 'application/x-msdownload', buffer: Buffer.from('MZ') });
    await expect(page.getByText('virus.exe')).toHaveCount(0);
  });

  test('changes the profile photo', async ({ page }) => {
    await startFlat(page);
    await tab(page, 'Profile');
    await button(page, 'Edit profile').click();
    await page.locator('input[type=file]').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: PNG }); // uploads on pick
    await expect(page.getByText('Photo updated')).toBeVisible();
  });
});

test.describe('local mode hides account features', () => {
  test('no documents, change password, delete account or invitations', async ({ page }) => {
    await startFlat(page);
    await tab(page, 'Profile');
    for (const t of ['Identity documents', 'Change password', 'Delete account', 'Invitations']) await expect(page.getByText(t)).toHaveCount(0);
    await tab(page, 'Flat');
    await expect(page.getByText('Invite a roommate')).toHaveCount(0);
  });
});

test.describe('fixed contribution', () => {
  test('an individual contribution can be set for a roommate', async ({ page }) => {
    await startFlat(page, 'Fija', { fixed: 100 });
    await addRoommate(page, 'Ana');
    await button(page, 'Ana').click();
    await page.getByRole('textbox', { name: 'Individual contribution' }).fill('80');
    await save(page);
    await expect(page.getByText('Saved').first()).toBeVisible();
  });
});
