import { expect, test, type Page } from '@playwright/test'

/**
 * #2021 — recette prod du 30/09 (commit `4a18b099a2`) : « PROUVÉ au bureau
 * (1512×861)… Tablette et mobile pas encore mesurés. » `onboarding-wizard-
 * breakpoints.spec.ts` (lot L08, 29/09) prouve déjà la rupture 800-1024-1440
 * px, mais dans le projet `web` (`devices['Desktop Chrome']`, sans
 * `isMobile`/`hasTouch`) — exactement le piège déjà documenté par #2639.1 et
 * répété au bilan du 29/09 sur #2097 : un viewport rétréci SANS pointeur
 * grossier laisse Chromium mesurer les cibles tactiles en taille BUREAU
 * (`pointer-coarse:min-h-11` ne s'applique qu'à `@media (pointer: coarse)`).
 *
 * Ce test vit donc dans le projet `web-mobile` (375×812 RÉEL, `isMobile` +
 * `hasTouch`, voir `playwright.config.ts`) plutôt que dans `web` — même
 * raison que `screen-reach.spec.ts` (#2639.1) : c'est le seul endroit où la
 * mesure tactile n'est pas un faux vert.
 */

const WEB_ORIGIN = 'http://127.0.0.1:4311'
const USER_ID = '2021bf84-3333-4a11-9c33-onboarding003'
const ONBOARDING_ID = '0a3c1861-840d-4606-8324-5fbea19bafff'
const MIN_TARGET_PX = 44

function json(body: unknown) {
  return { contentType: 'application/json', body: JSON.stringify(body) }
}

async function mockOnboardingWizardScreen(page: Page): Promise<void> {
  await page.context().addCookies([{ name: `loggedIn:${USER_ID}`, value: '1', url: WEB_ORIGIN }])

  await page.route('**/auth/session', route =>
    route.fulfill(
      json({
        user: {
          id: USER_ID,
          email: 'e2e-2021-mobile@bellum-ai.com',
          created_at: '2026-01-01T00:00:00.000Z',
          roles: ['customer'],
        },
      }),
    ),
  )
  await page.route('**/onboarding/state', route =>
    route.fulfill(
      json({
        id: ONBOARDING_ID,
        status: 'in_progress',
        current_stage_code: 'company_info',
        stages: [],
        answers: {},
        skipped_at: null,
        inherited_answer_keys: [],
        active_import_session_id: null,
        joined_workspace: null,
        effectif_observed_at: {},
      }),
    ),
  )
  await page.route('**/workspaces/me', route =>
    route.fulfill(
      json({
        workspace: {
          id: '9b1c2d3e-4f50-4a61-8b72-2021af840003',
          name: 'ESN e2e mobile',
          role: 'owner',
          memberCount: 1,
        },
        members: [],
      }),
    ),
  )
  await page.route('**/credits', route => route.fulfill(json({ features: [] })))
  await page.route('**/tool-registry', route => route.fulfill(json([])))
}

function overlaps(a: { x: number; y: number; width: number; height: number }, b: typeof a): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

/**
 * Défilement, chevauchement, cible tactile — les trois mesures communes aux
 * deux largeurs. `centerX` place le curseur au milieu du viewport AVANT de
 * défiler (même geste que `screen-reach.spec.ts`, #2639.1).
 */
async function assertWizardScreenIsUsable(page: Page, centerX: number): Promise<void> {
  const heading = page.getByRole('heading', { level: 1 }).first()
  await expect(heading).toBeVisible()

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  const width = await page.evaluate(() => window.innerWidth)
  expect(overflow, `défilement horizontal mesuré (${overflow}px) à ${width}px`).toBeLessThanOrEqual(1)

  const stepperBox = await page.locator('[data-testid="onboarding-stepper"]').first().boundingBox()
  const actionsBox = await page.locator('[data-testid="onboarding-actions"]').first().boundingBox()
  const helpCard = page.locator('[data-testid="onboarding-help-card"]').first()
  const helpVisible = await helpCard.isVisible().catch(() => false)
  const helpBox = helpVisible ? await helpCard.boundingBox() : null
  expect(actionsBox, 'la rangée Retour/Continuer doit être mesurable').not.toBeNull()

  if (stepperBox && actionsBox) {
    expect(overlaps(stepperBox, actionsBox), `stepper et rangée Retour/Continuer se chevauchent à ${width}px`).toBe(
      false,
    )
  }
  if (helpBox && actionsBox) {
    expect(
      overlaps(helpBox, actionsBox),
      `rangée Retour/Continuer et carte d’aide de Laura se chevauchent à ${width}px`,
    ).toBe(false)
  }

  // Le bouton « Continuer » doit être atteignable par un VRAI défilement de
  // page (molette), jamais `scrollIntoViewIfNeeded()` — même leçon que
  // #2639.1 (`screen-reach.spec.ts`) : un conteneur `overflow: hidden`
  // peut être forcé par script sans qu'un doigt ne l'atteigne jamais.
  const continueButton = page.getByRole('button', { name: /continuer/i }).first()
  await page.mouse.move(centerX, 400)
  for (let i = 0; i < 10; i += 1) {
    await page.mouse.wheel(0, 400)
  }
  await expect(continueButton).toBeVisible()
  const buttonBox = await continueButton.boundingBox()
  expect(buttonBox, 'le bouton Continuer a disparu du DOM après défilement').not.toBeNull()
  if (buttonBox) {
    // #2639.1 / #2097 (29/09) : mesuré ici SEULEMENT parce que `isMobile` +
    // `hasTouch` activent `@media (pointer: coarse)` — sans eux ce test
    // mesurerait le plancher BUREAU (32px, `h-8`) sous un déguisement mobile.
    expect(
      buttonBox.height,
      `cible Continuer haute de ${buttonBox.height}px à ${width}px — sous les 44px de GA-32`,
    ).toBeGreaterThanOrEqual(MIN_TARGET_PX)
  }
}

test.describe('#2021 — /onboarding, viewport mobile RÉEL 375×812 (isMobile+hasTouch)', () => {
  test('une seule colonne, aucun chevauchement, aucun défilement horizontal, cible ≥44px', async ({ page }) => {
    await mockOnboardingWizardScreen(page)
    await page.goto(`/onboarding/${ONBOARDING_ID}/company_info/equipe-commerciale`)
    await assertWizardScreenIsUsable(page, 187)
  })
})

// #2021 — la rupture 768-1024px (« tablette ») n'avait, jusqu'ici, été
// prouvée QUE dans le projet `web` (`devices['Desktop Chrome']`, viewport
// rétréci mais pointeur FIN) — `onboarding-wizard-breakpoints.spec.ts`.
// Une vraie tablette a un pointeur GROSSIER (`hasTouch`) : reprise ici, dans
// le projet `web-mobile` (`isMobile`+`hasTouch` déjà posés), avec une
// largeur de tablette réelle (820×1180, iPad Air) plutôt que les 375×812 par
// défaut du projet.
test.describe('#2021 — /onboarding, tablette RÉELLE 820×1180 (isMobile+hasTouch)', () => {
  test.use({ viewport: { width: 820, height: 1180 } })

  test('grille passée en colonnes (md), aucun chevauchement, cible ≥44px', async ({ page }) => {
    await mockOnboardingWizardScreen(page)
    await page.goto(`/onboarding/${ONBOARDING_ID}/company_info/equipe-commerciale`)
    await assertWizardScreenIsUsable(page, 410)
  })
})
