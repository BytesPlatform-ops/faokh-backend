import { expect, test, type Page } from '@playwright/test';

/**
 * Selling a provisionally-priced residence.
 *
 * Type D Elegant and Sonder arrived from Foakh ten times higher than every
 * other rate in the matrix, so they are held back until somebody ratifies the
 * figure. The point of the guard is to force a decision, not to make the unit
 * permanently unsellable — and the person making it is the broker on the deal,
 * with their Broker ID recorded against it.
 */

async function continueStep(page: Page) {
  const button = page.getByRole('button', { name: 'Continue', exact: true });
  await expect(button).toBeEnabled({ timeout: 15_000 });
  await button.click();
}

/** Drives the wizard to the price step for a given type and class. */
async function reachPriceStep(page: Page, typeName: string, className: string) {
  await page.goto('/bookings/new');
  await page.getByLabel('Find an existing client').fill('Ahmed Raza');
  await page.locator('label').filter({ hasText: 'Ahmed Raza Khan' }).first().click();
  await continueStep(page);

  await page.locator('label').filter({ hasText: 'Apartment' }).first().click();
  await continueStep(page);
  await page.locator('label').filter({ hasText: typeName }).first().click();
  await continueStep(page);
  await page.locator('label').filter({ hasText: className }).first().click();
  await continueStep(page);
  await page.getByText('Abdullah Block').first().click();
  await continueStep(page);
  await page.getByRole('button', { name: 'All available floors' }).click();
  await continueStep(page);
  await page.locator('label').filter({ hasText: typeName }).first().click();
  await continueStep(page);
}

test.describe('Provisional price, confirmed by the broker', () => {
  test('blocks first, then sells once the broker confirms', async ({ page }) => {
    test.setTimeout(180_000);
    await reachPriceStep(page, 'Type D', 'Elegant');

    // Blocked, and Continue is unavailable.
    await expect(page.getByText(/needs confirming before it can be sold/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled();

    // The discrepancy is stated, not hidden behind a generic refusal.
    await expect(page.getByText(/What needs deciding/i)).toBeVisible();
    await expect(page.getByText(/ten times every other rate/i)).toBeVisible();

    // The broker ratifies it under their own Broker ID.
    const confirm = page.getByRole('button', { name: /Confirm this price as BRK-/ });
    await expect(confirm).toBeVisible();
    await confirm.click();

    // Unblocked, priced, and the plan appears.
    await expect(page.getByText(/needs confirming/i)).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByText(/8,816,000/).filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText(/44 monthly instalments/).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeEnabled();

    // And the booking completes.
    await continueStep(page);
    await page.getByRole('checkbox').first().check();
    await continueStep(page);
    await page.getByRole('button', { name: 'Confirm booking' }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Confirm booking' }).click();

    await expect(page).toHaveURL(/\/bookings\/bkg-/, { timeout: 30_000 });
    await expect(page.getByText(/BKG-\d{4}-\d{6}/).first()).toBeVisible();

    // Straight through to both printable documents — no administrator involved.
    await expect(page.getByRole('link', { name: 'Client copy' })).toBeVisible();
    await page.getByRole('link', { name: 'Broker copy' }).click();
    await expect(page.getByText(/Broker commission schedule/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /Print/i })).toBeVisible();
  });

  test('a confirmed price stays confirmed while the broker moves around', async ({ page }) => {
    test.setTimeout(180_000);

    await reachPriceStep(page, 'Type D', 'Elegant');
    const confirm = page.getByRole('button', { name: /Confirm this price as BRK-/ });
    await expect(confirm).toBeVisible();
    await confirm.click();
    await expect(page.getByText(/needs confirming/i)).toHaveCount(0, { timeout: 30_000 });

    // Back to the unit and forward again, without reloading: a full page load
    // would reset the in-memory demo store, which would test the store rather
    // than the decision. The point is that the confirmation attaches to the
    // price, not to one pass through the wizard.
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByText('Choose a unit')).toBeVisible();
    await continueStep(page);

    await expect(page.getByText(/needs confirming/i)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeEnabled();
  });
});
