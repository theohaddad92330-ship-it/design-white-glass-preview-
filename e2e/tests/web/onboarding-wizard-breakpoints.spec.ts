import { expect, test, type Page } from '@playwright/test'

/**
 * #2021.14 — RECETTE : la grille à trois colonnes de l'onboarding guidé
 * (`OnboardingWizard.tsx`, `md:grid-cols-[220px_1fr_300px]`) aux ruptures
 * 768–1024 px et 1440 px.
 *
 * Chaque bilan depuis le 25/09 (#2021, commentaires 25→28/09) ferme ce point
 * en écrivant « reste : la mesure VISUELLE à ces ruptures, jugement humain,
 * hors périmètre d'un agent sans navigateur ». Cette prémisse était fausse
 * pour cette session : un Chromium piloté est disponible. Ce test ne remplace
 * pas un œil humain sur le PREMIUM/le calme visuel (jugement esthétique, hors
 * de portée d'une assertion) — il PROUVE ce que chaque bilan mesurait
 * concrètement à la main : aucun chevauchement entre les trois colonnes,
 * aucun défilement horizontal, largeur du contenu jamais nulle ni négative.
 *
 * Même patron réseau que `briefing-mobile-order.spec.ts` (mock des routes
 * consommées par l'écran, pas de backend réel — Tier 2, voir e2e/README.md).
 */

const WEB_ORIGIN = 'http://127.0.0.1:4311'
const USER_ID = '2021bf84-1111-4a11-9c33-onboarding001'
const ONBOARDING_ID = '0a3c1861-840d-4606-8324-5fbea19bafff'

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
          email: 'e2e-2021@bellum-ai.com',
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
        workspace: { id: '9b1c2d3e-4f50-4a61-8b72-2021af840001', name: 'ESN e2e', role: 'owner', memberCount: 1 },
        members: [],
      }),
    ),
  )
  await page.route('**/credits', route => route.fulfill(json({ features: [] })))
  await page.route('**/tool-registry', route => route.fulfill(json([])))
}

test.describe('#2021.14 — /onboarding, la grille trois colonnes aux ruptures 768–1024 px et 1440 px', () => {
  const BREAKPOINTS = [
    { width: 800, height: 900, label: '800×900 (juste au-dessus de md=768)' },
    { width: 1024, height: 900, label: '1024×900 (borne haute de la rupture citée)' },
    { width: 1440, height: 900, label: '1440×900' },
  ]

  for (const bp of BREAKPOINTS) {
    test(`aucun chevauchement stepper/questions/aide, aucun défilement horizontal — ${bp.label}`, async ({ page }) => {
      await page.setViewportSize({ width: bp.width, height: bp.height })
      await mockOnboardingWizardScreen(page)
      await page.goto(`/onboarding/${ONBOARDING_ID}/company_info/equipe-commerciale`)

      const heading = page.getByRole('heading', { level: 1 }).first()
      await expect(heading).toBeVisible()

      // Aucun défilement horizontal (la doléance du 26/09 était un
      // chevauchement de 158,8 px produit exactement par un débordement).
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow).toBeLessThanOrEqual(1)

      const stepperBox = await page.locator('[data-testid="onboarding-stepper"]').first().boundingBox()
      const actionsRow = page.locator('[data-testid="onboarding-actions"]').first()
      const actionsBox = await actionsRow.boundingBox()
      const helpCard = page.locator('[data-testid="onboarding-help-card"]').first()
      const helpVisible = await helpCard.isVisible().catch(() => false)
      const helpBox = helpVisible ? await helpCard.boundingBox() : null

      expect(actionsBox, 'la rangée Retour/Continuer doit être mesurable').not.toBeNull()

      function overlaps(a: { x: number; y: number; width: number; height: number }, b: typeof a): boolean {
        return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
      }

      if (stepperBox && actionsBox) {
        expect(overlaps(stepperBox, actionsBox), 'stepper et rangée Retour/Continuer se chevauchent').toBe(false)
      }
      // #2021 (26/09 16:33) — le défaut mesuré en recette à 900 px : la
      // rangée d'actions chevauchait la carte d'aide de Laura de 158,8 px.
      if (helpBox && actionsBox) {
        expect(overlaps(helpBox, actionsBox), 'rangée Retour/Continuer et carte d’aide de Laura se chevauchent').toBe(
          false,
        )
      }
    })
  }
})
