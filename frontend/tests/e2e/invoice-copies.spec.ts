import { expect, test, type Page } from '@playwright/test';

/**
 * The sales agent's own path to a printable document.
 *
 * A broker confirms the booking and prints from their own screen — there is no
 * administrator approval standing between the two. What separates the two
 * documents is the commission, and that separation is by *data*: the client
 * copy never receives the figures, so it is not a matter of a print stylesheet
 * hiding a section that is still in the page.
 */

async function continueStep(page: Page) {
  const button = page.getByRole('button', { name: 'Continue', exact: true });
  await expect(button).toBeEnabled({ timeout: 15_000 });
  await button.click();
}

/** Completes a booking and returns the detail page it lands on. */
async function bookThrough(page: Page) {
  await page.goto('/bookings/new');

  await page.getByLabel('Find an existing client').fill('Ahmed Raza');
  await page.locator('label').filter({ hasText: 'Ahmed Raza Khan' }).first().click();
  await continueStep(page);

  await page.locator('label').filter({ hasText: 'Apartment' }).first().click();
  await continueStep(page);
  await page.locator('label').filter({ hasText: 'Type A' }).first().click();
  await continueStep(page);
  await page.locator('label').filter({ hasText: 'Elegant' }).first().click();
  await continueStep(page);
  await page.getByText('Abdullah Block').first().click();
  await continueStep(page);
  await page.getByRole('button', { name: 'All available floors' }).click();
  await continueStep(page);
  await page.locator('label').filter({ hasText: 'Type A' }).first().click();
  await continueStep(page);
  await continueStep(page); // price + plan → review
  await page.getByRole('checkbox').first().check();
  await continueStep(page); // → confirm

  await page.getByRole('button', { name: 'Confirm booking' }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Confirm booking' }).click();

  await expect(page).toHaveURL(/\/bookings\/bkg-/, { timeout: 20_000 });
}

test.describe('Sales agent confirms and prints, with no approval step', () => {
  test('both copies are reachable straight from the booking', async ({ page }) => {
    test.setTimeout(120_000);
    await bookThrough(page);

    // Confirmed outright — nothing is waiting on an administrator.
    await expect(page.getByText(/BKG-\d{4}-\d{6}/).first()).toBeVisible();
    await expect(page.getByText('Confirmed', { exact: false }).first()).toBeVisible();

    // The agent's own screen offers both documents.
    await expect(page.getByRole('link', { name: 'Client copy' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Broker copy' })).toBeVisible();
  });

  test('the client copy carries no commission anywhere on the page', async ({ page }) => {
    test.setTimeout(120_000);
    await bookThrough(page);

    await page.getByRole('link', { name: 'Client copy' }).click();
    await expect(page).toHaveURL(/copy=CLIENT/);
    await expect(page.getByText('Client copy').first()).toBeVisible();

    // The property and the money the client owes are all present.
    await expect(page.getByText(/21,000,000/).first()).toBeVisible();
    await expect(page.getByText('Down payment').first()).toBeVisible();

    // Scoped to the document itself. The CRM sidebar carries a "Commissions"
    // nav link, which is screen furniture — it is hidden from print and is not
    // part of what the client receives.
    const sheet = page.locator('.invoice-sheet');
    await expect(sheet).toBeVisible();

    // Commission is absent from the document's DOM, not merely hidden — a
    // client can open developer tools, and a print stylesheet is not access
    // control.
    await expect(sheet.getByText(/commission/i)).toHaveCount(0);
    await expect(sheet.getByText(/840,000/)).toHaveCount(0);

    await expect(page.getByRole('button', { name: /Print/i })).toBeVisible();
  });

  test('the broker copy carries the full 4% schedule', async ({ page }) => {
    test.setTimeout(120_000);
    await bookThrough(page);

    await page.getByRole('link', { name: 'Broker copy' }).click();
    await expect(page).toHaveURL(/copy=BROKER/);
    await expect(page.getByText('Broker copy').first()).toBeVisible();

    const sheet = page.locator('.invoice-sheet');
    await expect(sheet.getByText(/Broker commission schedule/i)).toBeVisible();
    await expect(sheet.getByText(/840,000/).first()).toBeVisible();

    // Four 1% milestones.
    await expect(sheet.getByText(/210,000/).first()).toBeVisible();

    await expect(page.getByRole('button', { name: /Print/i })).toBeVisible();
  });
});
