import { expect, test, type Page } from '@playwright/test';

/**
 * Client form validation.
 *
 * These fields end up on a contract, so a wrong value is not a cosmetic
 * problem. Each case below is one a broker can plausibly type: an expired
 * CNIC, a birth date that makes the buyer a minor, a card that expires before
 * its holder was born.
 */

async function openCreateClient(page: Page) {
  await page.goto('/bookings/new');
  await page.getByRole('button', { name: '+ Create new client' }).first().click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible();
  return drawer;
}

/** A date offset from today, as the `YYYY-MM-DD` a date input expects. */
function isoOffset({ years = 0, days = 0 }: { years?: number; days?: number }) {
  const d = new Date();
  d.setFullYear(d.getFullYear() + years);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

test.describe('Client form validation', () => {
  test('rejects an expired CNIC and accepts a valid one', async ({ page }) => {
    const drawer = await openCreateClient(page);

    await drawer.locator('#d-name').fill('Sana Iqbal');
    await drawer.locator('#d-cnic').fill('3520212345671');
    await drawer.locator('#d-mobile').fill('03001234567');

    // Yesterday — Foakh cannot verify identity against an expired card.
    await drawer.locator('#d-cnic-exp').fill(isoOffset({ days: -1 }));
    await drawer.getByRole('button', { name: 'Save & continue booking' }).click();
    await expect(drawer.getByText(/CNIC has expired/i)).toBeVisible();
    await expect(drawer).toBeVisible();

    // A card valid for another five years is fine.
    await drawer.locator('#d-cnic-exp').fill(isoOffset({ years: 5 }));
    await drawer.getByRole('button', { name: 'Save & continue booking' }).click();
    await expect(drawer).toBeHidden({ timeout: 15_000 });
    await expect(page.getByTestId('selected-client')).toContainText('Sana Iqbal');
  });

  test('rejects a buyer under 18 and a future birth date', async ({ page }) => {
    const drawer = await openCreateClient(page);

    await drawer.locator('#d-name').fill('Minor Buyer');
    await drawer.locator('#d-cnic').fill('3520212345671');
    await drawer.locator('#d-mobile').fill('03001234567');

    await drawer.locator('#d-dob').fill(isoOffset({ years: -10 }));
    await drawer.getByRole('button', { name: 'Save & continue booking' }).click();
    await expect(drawer.getByText(/must be 18 or over/i)).toBeVisible();

    await drawer.locator('#d-dob').fill(isoOffset({ years: 1 }));
    await drawer.getByRole('button', { name: 'Save & continue booking' }).click();
    await expect(drawer.getByText(/cannot be in the future/i)).toBeVisible();
  });

  test('rejects a CNIC that expires before its holder was born', async ({ page }) => {
    const drawer = await openCreateClient(page);

    await drawer.locator('#d-name').fill('Impossible Dates');
    await drawer.locator('#d-cnic').fill('3520212345671');
    await drawer.locator('#d-mobile').fill('03001234567');

    await drawer.locator('#d-dob').fill(isoOffset({ years: -30 }));
    // Valid on its own — but before the birth date.
    await drawer.locator('#d-cnic-exp').fill(isoOffset({ years: -40 }));
    await drawer.getByRole('button', { name: 'Save & continue booking' }).click();
    await expect(drawer.getByText(/expired|before the date of birth/i).first()).toBeVisible();
  });

  test('rejects malformed and placeholder CNICs', async ({ page }) => {
    const drawer = await openCreateClient(page);

    await drawer.locator('#d-name').fill('Bad Cnic');
    await drawer.locator('#d-mobile').fill('03001234567');

    // Too short.
    await drawer.locator('#d-cnic').fill('35202');
    await drawer.getByRole('button', { name: 'Save & continue booking' }).click();
    await expect(drawer.getByText(/13 digits/i).first()).toBeVisible();

    // Right length, impossible province code.
    await drawer.locator('#d-cnic').fill('9520212345671');
    await drawer.getByRole('button', { name: 'Save & continue booking' }).click();
    await expect(drawer.getByText(/province code/i)).toBeVisible();

    // Right length, obviously a placeholder.
    await drawer.locator('#d-cnic').fill('1111111111111');
    await drawer.getByRole('button', { name: 'Save & continue booking' }).click();
    await expect(drawer.getByText(/placeholder/i)).toBeVisible();
  });

  test('rejects a bad mobile and a bad email', async ({ page }) => {
    const drawer = await openCreateClient(page);

    await drawer.locator('#d-name').fill('Contact Checks');
    await drawer.locator('#d-cnic').fill('3520212345671');

    await drawer.locator('#d-mobile').fill('12345');
    await drawer.getByRole('button', { name: 'Save & continue booking' }).click();
    await expect(drawer.getByText(/Pakistani mobile number/i).first()).toBeVisible();

    await drawer.locator('#d-mobile').fill('03001234567');
    await drawer.locator('#d-email').fill('not-an-email');
    await drawer.getByRole('button', { name: 'Save & continue booking' }).click();
    await expect(drawer.getByText(/valid email/i)).toBeVisible();
  });

  test('a co-applicant cannot be the same person as the client', async ({ page }) => {
    const drawer = await openCreateClient(page);

    await drawer.locator('#d-name').fill('Same Person');
    await drawer.locator('#d-cnic').fill('3520212345671');
    await drawer.locator('#d-mobile').fill('03001234567');
    await drawer.locator('#d-co-cnic').fill('3520212345671');

    await drawer.getByRole('button', { name: 'Save & continue booking' }).click();
    await expect(drawer.getByText(/same person as the client/i)).toBeVisible();
  });
});
