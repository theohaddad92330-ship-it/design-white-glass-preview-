import { expect, test } from '@playwright/test'

/**
 * Tier 2 — app shell (apps/web), unauthenticated only. Production `vite build`
 * served by `vite preview`, with VITE_API_URL baked to a dead port so the
 * session boot (`/auth/refresh` probe) fails fast and deterministically
 * resolves to "anonymous". No backend, no secret, no network flakiness.
 *
 * Language note: the SPA's i18n detection is localStorage-only (key
 * `bellum_lang`, FR fallback — see apps/web/src/i18n/index.ts). There is no
 * visible switcher on the pre-auth screens, so the EN test drives the exact
 * mechanism the app uses.
 */

test.describe('login page', () => {
  test('renders in French by default (Google + email code)', async ({ page }) => {
    await page.goto('/login')

    await expect(page.getByRole('heading', { name: 'Se connecter' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Continuer avec Google' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Recevoir un code par email' })).toBeVisible()
  })

  test('switches to English via the bellum_lang preference', async ({ page }) => {
    // Set the preference BEFORE any app script runs, exactly like a user who
    // picked EN in a previous session.
    await page.addInitScript(() => window.localStorage.setItem('bellum_lang', 'en'))
    await page.goto('/login')

    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Get a code by email' })).toBeVisible()
  })

  test('falls back to French when the preference is cleared again', async ({ page }) => {
    // Round-trip of the switch above: en → cleared → FR fallback.
    await page.addInitScript(() => window.localStorage.removeItem('bellum_lang'))
    await page.goto('/login')

    await expect(page.getByRole('heading', { name: 'Se connecter' })).toBeVisible()
  })
})

test.describe('auth guard', () => {
  test('unauthenticated visit to /dashboard redirects to /login', async ({ page }) => {
    await page.goto('/dashboard')

    // Session boot fails against the dead API port → anonymous → the
    // CustomerPage guard navigates to /login.
    await page.waitForURL('**/login')
    await expect(page.getByRole('heading', { name: 'Se connecter' })).toBeVisible()
  })
})
