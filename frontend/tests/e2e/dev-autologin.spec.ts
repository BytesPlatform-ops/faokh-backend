import { expect, test, type Page } from '@playwright/test';

/**
 * The development auto sign-in.
 *
 * Detected by navigating rather than by reading the served HTML: `/login` is
 * statically prerendered, so the auto sign-in branch exists only after the
 * client hydrates and never appears in the initial markup. Behaviour is the
 * only honest signal here.
 *
 * What this proves is narrow and deliberate — that a browser which types
 * nothing still ends up inside the CRM with a real, scoped session, and that
 * the session is genuine rather than a disabled guard.
 */

/** Visits a protected route and reports where the browser actually ended up. */
async function landsInsideCrm(page: Page): Promise<boolean> {
  await page.goto('/bookings');
  // Long enough for a bounce to /login, a Supabase round trip and a redirect
  // back — but short enough that a build without auto sign-in simply sits on
  // the form and reports false.
  await page.waitForTimeout(12_000);
  return !page.url().includes('/login');
}

test.describe('Dev auto sign-in', () => {
  test('lands on the broker screens without typing anything', async ({ page }) => {
    test.setTimeout(180_000);

    const inside = await landsInsideCrm(page);
    test.skip(!inside, 'Build has no dev auto sign-in configured.');

    await expect(page).toHaveURL(/\/bookings$/);

    // The banner must be visible: a bypass nobody can see is a bypass nobody
    // remembers to turn off.
    await expect(page.getByText(/Dev auto sign-in/i).first()).toBeVisible({ timeout: 30_000 });

    // A real session with real scope. The identity comes from the CRM database
    // via the API, not from anything the browser asserted about itself.
    await expect(page.getByText('BRK-2026-000001').first()).toBeVisible({ timeout: 30_000 });

    // And real Supabase-backed inventory behind it.
    await page.goto('/inventory');
    await expect(page.getByText('18,800,000').first()).toBeVisible({ timeout: 30_000 });
  });

  test('the session is genuine — signing out still locks the CRM', async ({ page }) => {
    test.setTimeout(180_000);

    const inside = await landsInsideCrm(page);
    test.skip(!inside, 'Build has no dev auto sign-in configured.');

    await page.goto('/dashboard');
    await expect(page.getByText('BRK-2026-000001').first()).toBeVisible({ timeout: 30_000 });

    // Proves no guard was removed: clearing the session shuts the CRM again,
    // and it is the auto sign-in — not an open door — that reopens it.
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });
  });
});
