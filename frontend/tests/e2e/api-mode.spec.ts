import { expect, test } from '@playwright/test';

/**
 * The API-mode acceptance scenario.
 *
 * Everything here runs against the real NestJS API and the real Supabase
 * database. That is the point: the mock store is a per-document singleton, so
 * it cannot survive a reload — anything still on screen after `reload()` came
 * out of Postgres, which is the only way to prove persistence rather than
 * assert it.
 *
 * Skipped unless E2E_API_MODE=1, because it needs the backend running, the
 * frontend built with NEXT_PUBLIC_DATA_MODE=api, and credentials.
 */

import type { Page } from '@playwright/test';

const EMAIL = process.env.E2E_EMAIL ?? '';
const PASSWORD = process.env.E2E_PASSWORD ?? '';

async function continueStep(page: Page) {
  const button = page.getByRole('button', { name: 'Continue', exact: true });
  await expect(button).toBeEnabled({ timeout: 30_000 });
  await button.click();
}

test.describe('API mode — live Supabase', () => {
  test.skip(process.env.E2E_API_MODE !== '1', 'Requires the API-mode stack.');

  test('an unauthenticated visitor is sent to sign in', async ({ page, baseURL, request }) => {
    // The dev auto sign-in, when configured, deliberately defeats this: it
    // signs the visitor in instead of leaving them on the form. That is the
    // feature working, not the guard failing, so the assertion is skipped
    // rather than weakened.
    const login = await request.get(`${baseURL!}/login`);
    test.skip(
      (await login.text()).includes('Development auto sign-in is enabled'),
      'Dev auto sign-in is active in this build.',
    );

    await page.goto('/bookings');
    await expect(page).toHaveURL(/\/login\?next=/, { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: /Foakh/ })).toBeVisible();
  });

  test('completes a whole booking against Supabase and it survives a refresh', async ({
    page,
  }) => {
    // A real journey over a real network: sign-in, thirteen screens, a
    // transactional write and two reloads. The default budget is for a single
    // interaction, not an end-to-end sale.
    test.setTimeout(240_000);

    await page.goto('/login');

    await page.getByLabel('Email').fill(EMAIL);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Lands in the CRM, identified by the CRM database rather than the token.
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
    await expect(page.getByText('BRK-2026-000001').first()).toBeVisible({ timeout: 30_000 });
    // The demo-data badge must be gone — this is real inventory.
    await expect(page.getByText('Demo data')).toHaveCount(0);

    // --- inventory is priced from the matrix in Postgres --------------------
    await page.getByRole('link', { name: 'Inventory', exact: true }).filter({ visible: true }).first().click();
    await expect(page).toHaveURL(/\/inventory$/);
    // Type A Classic. Null here would mean the price matrix was never resolved.
    await expect(page.getByText('18,800,000').first()).toBeVisible({ timeout: 30_000 });
    // The corrected hierarchy survives the round trip through the API.
    await expect(
      page.getByText('Duplex Penthouse').filter({ visible: true }).first(),
    ).toBeVisible();
    await expect(page.getByText('Type E')).toHaveCount(0);

    // --- the booking written through the API is here ------------------------
    await page.getByRole('link', { name: 'Bookings', exact: true }).filter({ visible: true }).first().click();
    await expect(page.getByText(/BKG-\d{4}-\d{6}/).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Zainab Qureshi').first()).toBeVisible();

    // --- the actual persistence proof --------------------------------------
    // A full reload tears down every in-memory store. Whatever is still on the
    // page afterwards was re-fetched from Supabase.
    await page.reload();
    await expect(page.getByText(/BKG-\d{4}-\d{6}/).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Zainab Qureshi').first()).toBeVisible();

    // --- the frozen snapshot carries the corrected vocabulary ---------------
    await page.getByText(/BKG-\d{4}-\d{6}/).first().click();
    await expect(page.getByText('Apartment').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('3 Attached Bathrooms').or(page.getByText('Attached bathrooms')).first()).toBeVisible();
    await expect(page.getByText('21,000,000').first()).toBeVisible();

    // --- a whole new booking, written to Postgres ---------------------------
    await page
      .getByRole('link', { name: 'Bookings', exact: true })
      .filter({ visible: true })
      .first()
      .click();
    await page.getByRole('link', { name: /New Booking/i }).first().click();
    await expect(page).toHaveURL(/\/bookings\/new/, { timeout: 20_000 });

    const unique = String(Date.now()).slice(-7);
    await page.getByRole('button', { name: '+ Create new client' }).first().click();
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    await drawer.getByLabel('Full legal name').fill(`E2E Buyer ${unique}`);
    await drawer.getByLabel('CNIC', { exact: false }).first().fill(`42101${unique}1`);
    await drawer.getByLabel('Mobile', { exact: false }).first().fill('03005550001');
    await drawer.getByRole('button', { name: 'Save & continue booking' }).click();
    await expect(drawer).toBeHidden({ timeout: 30_000 });

    // The Client ID is allocated by the server, not the browser.
    const selected = page.getByTestId('selected-client');
    await expect(selected).toContainText(/CLI-\d{4}-\d{6}/, { timeout: 30_000 });
    await continueStep(page);

    await page.locator('label').filter({ hasText: 'Apartment' }).first().click();
    await continueStep(page);

    const typeA = page.locator('label').filter({ hasText: 'Type A' }).first();
    await expect(typeA).toContainText('3 Bedrooms');
    await expect(typeA).toContainText('3 Attached Bathrooms');
    await expect(typeA).toContainText('1,102 sq ft');
    await typeA.click();
    await continueStep(page);

    await page.locator('label').filter({ hasText: 'Elegant' }).first().click();
    await expect(page.getByText(/21,000,000/).first()).toBeVisible({ timeout: 30_000 });
    await continueStep(page);

    await page.getByText('Abdullah Block').first().click();
    await continueStep(page);

    await page.getByRole('button', { name: 'All available floors' }).click();
    await continueStep(page);

    await page.locator('label').filter({ hasText: 'Type A' }).first().click();
    await continueStep(page);

    // Rate and the full 10/10/10/60÷44/10 plan, both derived server-side.
    await expect(page.getByText(/19,056\.26/).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/44 monthly instalments/).first()).toBeVisible();
    await continueStep(page);

    await page.getByRole('checkbox').first().check();
    await continueStep(page);

    await page.getByRole('button', { name: 'Confirm booking' }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Confirm booking' }).click();

    await expect(page).toHaveURL(/\/bookings\/[0-9a-f-]{36}/, { timeout: 40_000 });
    const bookingUrl = page.url();
    await expect(page.getByText(/BKG-\d{4}-\d{6}/).first()).toBeVisible({ timeout: 30_000 });

    // --- the persistence proof: a full reload discards every in-memory store
    await page.reload();
    await expect(page.getByText(/BKG-\d{4}-\d{6}/).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(`E2E Buyer ${unique}`).first()).toBeVisible();
    expect(page.url()).toBe(bookingUrl);

    // The client persists independently of the booking.
    await page.goto('/clients');
    await expect(page.getByText(`E2E Buyer ${unique}`).first()).toBeVisible({ timeout: 30_000 });

    // --- signing out actually ends the session ------------------------------
    await page.goto('/dashboard');
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });

    await page.goto('/bookings');
    await expect(page).toHaveURL(/\/login\?next=/, { timeout: 20_000 });
  });
});
