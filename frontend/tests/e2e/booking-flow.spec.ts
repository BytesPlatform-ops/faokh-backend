import { expect, test, type Page } from '@playwright/test';

/**
 * The acceptance scenario: a broker completes an entire sale from
 * `/bookings/new` without navigating to Clients or Inventory, and without
 * answering a single question the CRM could have answered for them.
 */

/** Advances the wizard, waiting for Continue to become enabled. */
async function continueStep(page: Page) {
  const button = page.getByRole('button', { name: 'Continue', exact: true });
  await expect(button).toBeEnabled({ timeout: 15_000 });
  await button.click();
}

test.describe('New Booking is one short, deterministic flow', () => {
  test('creates a client inline and completes the booking', async ({ page }) => {
    await page.goto('/bookings/new');
    await expect(page.getByRole('heading', { name: 'New booking' })).toBeVisible();

    // Five stages, and no raw internal step counter anywhere on screen.
    const stages = page.getByTestId('booking-stages');
    await expect(stages).toBeVisible();
    await expect(stages.getByRole('listitem')).toHaveCount(5);
    for (const stage of ['Client', 'Residence', 'Property', 'Payment', 'Review']) {
      await expect(stages.getByText(stage, { exact: false }).first()).toBeVisible();
    }
    await expect(page.getByText(/step \d+ of \d+/i)).toHaveCount(0);

    // --- Client: created without leaving the wizard -------------------------
    await page.getByRole('button', { name: '+ Create new client' }).first().click();
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();

    const unique = String(Date.now()).slice(-7);
    await drawer.getByLabel('Full legal name').fill('Ahmed Khan');
    await drawer.getByLabel('CNIC', { exact: false }).first().fill(`42101${unique}1`);
    await drawer.getByLabel('Mobile', { exact: false }).first().fill('03001234567');
    await drawer.getByRole('button', { name: 'Save & continue booking' }).click();

    await expect(drawer).toBeHidden({ timeout: 15_000 });
    const selectedClient = page.getByTestId('selected-client');
    await expect(selectedClient).toBeVisible({ timeout: 15_000 });
    await expect(selectedClient).toContainText('Ahmed Khan');
    await expect(selectedClient).toContainText(/CLI-\d{4}-\d{6}/);
    // The URL never changed: no redirect to /clients/new.
    expect(page.url()).toContain('/bookings/new');

    await continueStep(page); // → Residence category

    // --- Residence category -------------------------------------------------
    await expect(page.getByText('What is being booked?')).toBeVisible();
    await expect(page.getByText('Type E')).toHaveCount(0);
    await page.locator('label').filter({ hasText: 'Apartment' }).first().click();
    await continueStep(page); // → Type

    // --- Apartment type, which fixes every specification --------------------
    await expect(page.getByText('Choose the apartment type')).toBeVisible();
    const layoutCard = page.locator('label').filter({ hasText: 'Type A' }).first();
    await expect(layoutCard).toContainText('3 Bedrooms');
    await expect(layoutCard).toContainText('3 Attached Bathrooms');
    await expect(layoutCard).toContainText('Balcony');
    await expect(layoutCard).toContainText('1 Parking');
    await expect(layoutCard).toContainText('1,102 sq ft');
    await layoutCard.click();
    await expect(page.getByText('Type A specifications').first()).toBeVisible();
    await continueStep(page); // → Class

    // --- Class: the price is known before any unit is chosen ----------------
    await expect(page.getByText('Choose the residence class')).toBeVisible();
    await expect(page.getByText('Fully furnished.', { exact: true })).toBeVisible();
    await page.locator('label').filter({ hasText: 'Elegant' }).first().click();
    await expect(page.getByText(/21,000,000/).first()).toBeVisible();
    // The upgrade is quantified against Classic.
    await expect(page.getByText(/vs Classic/).first()).toBeVisible();
    await continueStep(page); // → Building

    // --- Building ------------------------------------------------------------
    await page.getByText('Abdullah Block').first().click();
    await continueStep(page); // → Floor

    // --- Floor: real availability only, no preference language --------------
    await expect(page.getByText('Choose a floor')).toBeVisible();
    await expect(page.getByText(/No floor matches those preferences/)).toHaveCount(0);
    await expect(page.getByText(/only the client's preferences/i)).toHaveCount(0);
    await page.getByRole('button', { name: 'All available floors' }).click();
    await continueStep(page); // → Unit

    // --- Unit: one clean list, no "outside your preferences" ----------------
    await expect(page.getByText('Choose a unit')).toBeVisible();
    await expect(page.getByText(/outside the stated preferences/)).toHaveCount(0);
    const unitCard = page.locator('label').filter({ hasText: 'Type A' }).first();
    await expect(unitCard).toBeVisible({ timeout: 15_000 });
    await unitCard.click();
    await continueStep(page); // → Price and payment plan

    // --- Price and plan, both derived ---------------------------------------
    await expect(page.getByText('Price and payment plan')).toBeVisible();
    await expect(page.getByText('1,102 sq ft').filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText(/19,056\.26/).filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText(/21,000,000/).filter({ visible: true }).first()).toBeVisible();
    // The plan appears automatically — there is no payment-preference question.
    await expect(page.getByText('Down payment').first()).toBeVisible();
    await expect(page.getByText(/44 monthly instalments/).first()).toBeVisible();
    await expect(page.getByText(/To be confirmed/).first()).toBeVisible();
    await continueStep(page); // → Review

    // --- Review, with the one affirmation the agent must make ---------------
    await expect(page.getByText('Review the booking')).toBeVisible();
    await expect(page.getByText(/BRK-\d{4}-\d{6}/).first()).toBeVisible();
    // 10% of 21,000,000, calculated rather than typed.
    await expect(page.getByText(/2,100,000/).first()).toBeVisible();
    await page.getByRole('checkbox').first().check();
    await continueStep(page); // → Confirm

    // --- Confirm --------------------------------------------------------------
    await page.getByRole('button', { name: 'Confirm booking' }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Confirm booking' }).click();

    await expect(page).toHaveURL(/\/bookings\/bkg-/, { timeout: 20_000 });
    await expect(page.getByText(/BKG-\d{4}-\d{6}/).first()).toBeVisible();

    // Navigate via the CRM's own links rather than page.goto(): the mock store
    // is a per-document singleton, so a full reload resets the demo data.
    await page.getByRole('link', { name: 'Bookings', exact: true }).filter({ visible: true }).first().click();
    await expect(page).toHaveURL(/\/bookings$/);
    await expect(page.getByText('Ahmed Khan').filter({ visible: true }).first()).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('link', { name: 'Clients', exact: true }).filter({ visible: true }).first().click();
    await expect(page).toHaveURL(/\/clients$/);
    await expect(page.getByText('Ahmed Khan').filter({ visible: true }).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test('selects an existing client instead of creating one', async ({ page }) => {
    await page.goto('/bookings/new');

    await page.getByLabel('Find an existing client').fill('Ahmed Raza');
    const result = page.locator('label').filter({ hasText: 'Ahmed Raza Khan' }).first();
    await expect(result).toBeVisible({ timeout: 15_000 });
    await result.click();

    await expect(page.getByTestId('selected-client')).toContainText('Ahmed Raza Khan');
    await continueStep(page);
    await expect(page.getByText('What is being booked?')).toBeVisible();
  });

  test('keeps selections when moving backwards', async ({ page }) => {
    await page.goto('/bookings/new');

    await page.getByLabel('Find an existing client').fill('Fatima');
    const result = page.locator('label').filter({ hasText: 'Fatima Siddiqui' }).first();
    await expect(result).toBeVisible({ timeout: 15_000 });
    await result.click();
    await continueStep(page); // → Category

    await page.locator('label').filter({ hasText: 'Apartment' }).first().click();
    await continueStep(page); // → Type
    await page.locator('label').filter({ hasText: 'Type B' }).first().click();
    await continueStep(page); // → Class
    await page.locator('label').filter({ hasText: 'Classic' }).first().click();
    await continueStep(page); // → Building
    await page.getByText('Umer Block').first().click();

    // All the way back, then forward again — nothing may be lost.
    for (let step = 0; step < 4; step += 1) {
      await page.getByRole('button', { name: 'Back' }).click();
    }
    await expect(page.getByTestId('selected-client')).toContainText('Fatima Siddiqui');
    for (let step = 0; step < 4; step += 1) {
      await continueStep(page);
    }
    await expect(page.locator('label').filter({ hasText: 'Umer Block' })).toBeVisible();
  });
});

test.describe('The removed questionnaire stays removed', () => {
  test('no preference fields appear anywhere in the booking flow', async ({ page }) => {
    await page.goto('/bookings/new');

    await page.getByLabel('Find an existing client').fill('Fatima');
    await page.locator('label').filter({ hasText: 'Fatima Siddiqui' }).first().click();
    await continueStep(page);

    // Every one of these was a question the CRM already knew the answer to, or
    // a preference that made real inventory disappear.
    const banished = [
      'Purchase purpose',
      'Bedrooms required',
      'Budget from',
      'Budget to',
      'Upfront budget',
      'Payment preference',
      'Floor preference',
      'Balcony required',
      'Parking required',
      'Interest in a duplex penthouse',
      'Needs advice',
    ];

    for (const label of banished) {
      await expect(
        page.getByText(label, { exact: false }),
        `"${label}" must not appear in the booking flow`,
      ).toHaveCount(0);
    }
  });
});

test.describe('Residence hierarchy', () => {
  test('a duplex penthouse skips the apartment type step', async ({ page }) => {
    await page.goto('/bookings/new');

    await page.getByLabel('Find an existing client').fill('Fatima');
    const result = page.locator('label').filter({ hasText: 'Fatima Siddiqui' }).first();
    await expect(result).toBeVisible({ timeout: 15_000 });
    await result.click();
    await continueStep(page); // → Category

    await expect(page.getByText('What is being booked?')).toBeVisible();
    await page.locator('label').filter({ hasText: 'Duplex Penthouse' }).first().click();
    await continueStep(page);

    // There is no Type A–D specification for a duplex, so the type step is
    // skipped entirely rather than shown with nothing valid to choose.
    await expect(page.getByText('Choose the residence class')).toBeVisible();
    await expect(page.getByText('Choose the apartment type')).toHaveCount(0);

    // And going back returns to the category, not to an empty type screen.
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByText('What is being booked?')).toBeVisible();
  });

  test('the penthouse is never presented as Type E', async ({ page }) => {
    await page.goto('/inventory');

    // Visible-only: the type filter also carries a "Duplex Penthouse" <option>,
    // which is present in the DOM but not rendered until the select is opened.
    await expect(
      page.getByText('Duplex Penthouse').filter({ visible: true }).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Type E')).toHaveCount(0);

    // The duplex spans two floors, so it prints its span rather than one number.
    await expect(page.getByText('11th + 12th Floor').first()).toBeVisible();
  });
});

test.describe('Responsive', () => {
  for (const width of [320, 360, 390, 430, 768]) {
    test(`no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/bookings/new');
      await expect(page.getByRole('heading', { name: 'New booking' })).toBeVisible();

      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      expect(overflows, `page overflows horizontally at ${width}px`).toBe(false);
    });
  }

  test('mobile shows the collapsible booking summary', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto('/bookings/new');

    const summary = page.getByRole('button', { name: /This booking/ });
    await expect(summary).toBeVisible();
    await summary.click();
    await expect(page.getByText('Not selected').first()).toBeVisible();
  });
});
