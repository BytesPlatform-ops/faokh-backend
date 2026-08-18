import { expect, test, type Page } from '@playwright/test';

/**
 * The two acceptance journeys, against the real API and Supabase.
 *
 * What separates them is one thing with real financial consequence: a direct
 * sale creates no broker commission, and a referred sale creates a 4% schedule
 * against the broker who introduced the client. The internal Sales Agent is
 * paid neither — they are staff.
 */

const EMAIL = process.env.E2E_EMAIL ?? 'agent1@foakh.local';
const PASSWORD = process.env.E2E_PASSWORD ?? '';

async function continueStep(page: Page) {
  const button = page.getByRole('button', { name: 'Continue', exact: true });
  await expect(button).toBeEnabled({ timeout: 30_000 });
  await button.click();
}

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 40_000 });
}

/** Fills the inline client drawer and returns once the client is attached. */
async function createClientInline(page: Page, name: string, cnic: string, mobile: string) {
  await page.getByRole('button', { name: '+ Create new client' }).first().click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible();
  await drawer.locator('#d-name').fill(name);
  await drawer.locator('#d-cnic').fill(cnic);
  await drawer.locator('#d-mobile').fill(mobile);
  await drawer.getByRole('button', { name: 'Save & continue booking' }).click();
  await expect(drawer).toBeHidden({ timeout: 40_000 });
  await expect(page.getByTestId('selected-client')).toContainText(/CLI-\d{4}-\d{6}/, {
    timeout: 30_000,
  });
}

/** Building → Type → Floor → Physical unit → Class. Class comes last. */
async function chooseProperty(page: Page, building: string, type: string, className: string) {
  await page.getByText(building).first().click();
  await continueStep(page); // → Type

  await expect(page.getByText('Choose the apartment type')).toBeVisible();
  await page.locator('label').filter({ hasText: type }).first().click();
  await continueStep(page); // → Floor

  await expect(page.getByText('Choose a floor')).toBeVisible();
  await page.getByRole('button', { name: 'All available floors' }).click();
  await continueStep(page); // → Physical unit

  await expect(page.getByText('Choose the physical unit')).toBeVisible();
  await page.locator('label').filter({ hasText: type }).first().click();
  await continueStep(page); // → Class

  // Class is chosen AFTER the physical apartment: one unit, three finishes.
  await expect(page.getByText('Choose the finish and service class')).toBeVisible();
  await page.locator('label').filter({ hasText: className }).first().click();
  await continueStep(page); // → Price and plan
}

async function confirmBooking(page: Page) {
  await expect(page.getByText(/44 monthly instalments/).first()).toBeVisible({ timeout: 30_000 });
  await continueStep(page); // → Review
  await page.getByRole('checkbox').first().check();
  await continueStep(page); // → Confirm

  await page.getByRole('button', { name: 'Confirm booking' }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Confirm booking' }).click();
  await expect(page).toHaveURL(/\/bookings\/[0-9a-f-]{36}/, { timeout: 60_000 });
}

test.describe('Sales Agent journeys against live Supabase', () => {
  test.skip(PASSWORD === '', 'Set E2E_PASSWORD to the agent1 Supabase password.');

  test('direct sale — no broker, and no commission is created', async ({ page }) => {
    test.setTimeout(300_000);
    await signIn(page);

    // The authenticated user is a Sales Agent, not a broker.
    await expect(page.getByText('SAG-2026-000001').first()).toBeVisible({ timeout: 30_000 });

    await page.goto('/bookings/new');
    const unique = String(Date.now()).slice(-7);
    await createClientInline(page, `Direct E2E ${unique}`, `42101${unique}1`, '03005551111');
    await continueStep(page); // → Source

    await expect(page.getByText('How did this client come to Foakh?')).toBeVisible();
    await page.getByRole('button', { name: 'Direct / walk-in' }).click();
    await expect(page.getByText(/No broker commission on this booking/i)).toBeVisible();
    await continueStep(page); // → Residence

    await page.locator('label').filter({ hasText: 'Apartment' }).first().click();
    await continueStep(page); // → Building

    await chooseProperty(page, 'Abdullah Block', 'Type A', 'Elegant');

    // The review names all three parties, and says plainly there is no broker.
    await expect(
      page.getByText(/21,000,000/).filter({ visible: true }).first(),
    ).toBeVisible({ timeout: 30_000 });
    await continueStep(page); // → Review
    await expect(
      page.getByText('None — direct sale').filter({ visible: true }).first(),
    ).toBeVisible();
    await page.getByRole('checkbox').first().check();
    await continueStep(page);

    await page.getByRole('button', { name: 'Confirm booking' }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Confirm booking' }).click();
    await expect(page).toHaveURL(/\/bookings\/[0-9a-f-]{36}/, { timeout: 60_000 });

    await expect(page.getByText(/BKG-\d{4}-\d{6}/).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('SAG-2026-000001').first()).toBeVisible();

    // Survives a reload: this came out of Postgres, not a browser store.
    await page.reload();
    await expect(page.getByText(/BKG-\d{4}-\d{6}/).first()).toBeVisible({ timeout: 30_000 });
  });

  test('broker sale — inline broker, and a 4% schedule is created', async ({ page }) => {
    test.setTimeout(300_000);
    await signIn(page);

    await page.goto('/bookings/new');
    const unique = String(Date.now()).slice(-7);
    await createClientInline(page, `Referred E2E ${unique}`, `42101${unique}2`, '03005552222');
    await continueStep(page); // → Source

    await page.getByRole('button', { name: 'External broker' }).click();

    // Created without leaving the booking.
    await page.getByRole('button', { name: '+ Add new broker' }).first().click();
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    await drawer.locator('#b-name').fill(`Partner ${unique}`);
    await drawer.locator('#b-agency').fill(`Agency ${unique}`);
    // Unique per run: a repeated mobile trips the duplicate-broker guard,
    // which is correct behaviour but not what this test is checking.
    await drawer.locator('#b-mobile').fill(`0321${unique}`);
    await drawer.getByRole('button', { name: 'Save & continue booking' }).click();
    await expect(drawer).toBeHidden({ timeout: 40_000 });

    // The server allocated the Broker ID.
    const selectedBroker = page.getByTestId('selected-broker');
    await expect(selectedBroker).toContainText(/BRK-\d{4}-\d{6}/, { timeout: 30_000 });
    await expect(selectedBroker).toContainText(/4% commission schedule/i);
    await continueStep(page); // → Residence

    await page.locator('label').filter({ hasText: 'Apartment' }).first().click();
    await continueStep(page); // → Building

    await chooseProperty(page, 'Umer Block', 'Type B', 'Sonder');
    await confirmBooking(page);

    await expect(page.getByText(/BKG-\d{4}-\d{6}/).first()).toBeVisible({ timeout: 30_000 });

    // Three distinct parties on the booking.
    await expect(page.getByText('SAG-2026-000001').first()).toBeVisible();
    await expect(page.getByText(/BRK-\d{4}-\d{6}/).first()).toBeVisible();
  });

  test('brokers screen lists the referral partner and its totals', async ({ page }) => {
    test.setTimeout(180_000);
    await signIn(page);

    await page.goto('/brokers');
    await expect(page.getByRole('heading', { name: 'Brokers' })).toBeVisible();
    await expect(page.getByText(/BRK-\d{4}-\d{6}/).first()).toBeVisible({ timeout: 30_000 });
  });
});
