import { expect, test } from '@playwright/test'

/**
 * Tier 1 — marketing site (apps/website). Production `next build` served by
 * `next start`; zero backend, zero secret. FR is the default locale with
 * prefix-less URLs, EN lives under /en (next-intl, `localePrefix: 'as-needed'`).
 */

test.describe('home', () => {
  test('renders in French by default', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr')
    // Hero title, split across spans inside a single h1.
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/L['’]IA commerciale/)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('ESN')
  })

  test('serves the English version under /en', async ({ page }) => {
    await page.goto('/en')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('The sales AI')
  })
})

test.describe('pricing', () => {
  /**
   * Grille du 27/08/2026 : TROIS cartes, un seul palier achetable.
   *
   * Ce test a annoncé « Starter-Solo / Team / Growth » et « 119 / 259 / 599 € »
   * pendant des semaines sans que personne ne le voie rouge : le job E2E mourait
   * sur le build du site avant d'ouvrir un navigateur. Ce qu'il vérifie ici est
   * donc exactement ce qu'un visiteur doit lire.
   */
  test('shows the free demo, the single paid tier and the quote card', async ({ page }) => {
    await page.goto('/pricing')

    // Les trois cartes. « Free » et « Entreprise » ne sont pas des paliers —
    // l'une est la démonstration, l'autre un devis — mais elles s'affichent.
    await expect(page.getByText('Free', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Growth', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Entreprise', { exact: true }).first()).toBeVisible()

    // Monthly is the default billing period — the monthly grid must show.
    // \s* tolerates NBSP vs regular space between amount and €.
    await expect(page.getByText(/199\s*€/).first()).toBeVisible()

    // Et AUCUN prix retiré de la vente ne subsiste : un montant orphelin sur une
    // page de tarifs est une promesse que Stripe ne tiendra pas.
    await expect(page.getByText(/119\s*€/)).toHaveCount(0)
    await expect(page.getByText(/249\s*€/)).toHaveCount(0)
    await expect(page.getByText('Starter')).toHaveCount(0)

    // The monthly/annual toggle is present (the annual button also carries
    // the "−20 %" badge, hence the non-exact name match).
    await expect(page.getByRole('button', { name: 'Mensuel' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Annuel/ })).toBeVisible()
  })
})

test.describe('beta', () => {
  test('renders with the application form present (not submitted)', async ({ page }) => {
    await page.goto('/beta')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('dossier de conquête')

    // The real form (excludes the hidden honeypot-only wrapper): one visible
    // email input and one submit button. We assert presence only — submitting
    // would hit the /api/beta route.
    const form = page.locator('form:has(input[name="email"])')
    await expect(form).toHaveCount(1)
    await expect(form.locator('input[type="email"][name="email"]')).toBeVisible()
    await expect(form.locator('button[type="submit"]')).toBeVisible()
  })
})

test.describe('webinar', () => {
  test('renders with the registration form present (not submitted)', async ({ page }) => {
    await page.goto('/webinar')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Préparer un compte en minutes')

    const form = page.locator('form:has(input[name="email"])')
    await expect(form).toHaveCount(1)
    await expect(form.locator('input[type="email"][name="email"]')).toBeVisible()
    await expect(form.locator('button[type="submit"]')).toBeVisible()
  })
})

test.describe('sitemap', () => {
  test('sitemap.xml is served and lists both locales', async ({ request }) => {
    const response = await request.get('/sitemap.xml')
    expect(response.status()).toBe(200)

    const body = await response.text()
    expect(body).toContain('<urlset')
    expect(body).toContain('/pricing')
    expect(body).toContain('/en/pricing')
    expect(body).toContain('/beta')
    expect(body).toContain('/webinar')
  })
})
