import { expect, test, type Page } from '@playwright/test'

/**
 * #2639.1 et sa famille — LA PREUVE MOBILE.
 *
 * Décision Louis 22/09/2026 : `resize_window` du navigateur piloté répond
 * « Successfully resized » mais `window.innerWidth` mesuré reste bloqué à
 * 1512 (mesuré les 21 et 22/09) — cette famille de points (le bouton de
 * reprise de l'onboarding, mobile, Windows 125 %/150 %, portable 13″) est
 * IMPOSSIBLE à prouver au navigateur piloté. Elle se prouve donc ici, dans
 * un vrai viewport Playwright (projet `web-mobile`, 375×812 — voir
 * `playwright.config.ts`), en CI.
 *
 * Trois mesures, jamais lues :
 *  1. le bouton d'action principal est DANS le viewport après un vrai
 *     défilement de la PAGE — `page.mouse.wheel`, jamais
 *     `locator.scrollIntoViewIfNeeded()`. La distinction est le point :
 *     `scrollIntoView` peut forcer le `scrollTop` d'un conteneur
 *     `overflow: hidden` par script, ce qu'un doigt ou une molette ne peut
 *     jamais faire. C'est exactement le bug d'origine de #2639.1
 *     (`#app-shell { height: 100dvh; overflow: hidden }`, index.css) : un
 *     test qui « scrollerait pour de vrai » via l'API DOM aurait été VERT
 *     alors que personne, dans un vrai navigateur, n'atteignait le bouton.
 *  2. la cible fait ≥ 44 px dans les deux dimensions (garde GA-32).
 *  3. aucun défilement horizontal du corps.
 *
 * Chaque route non-authentifiée (/signup, /forgot-password) se visite telle
 * quelle. `/onboarding` exige une session : ce tier n'a pas de backend
 * (VITE_API_URL pointe un port mort, voir playwright.config.ts) donc la
 * session est simulée au plus près du contrat réel — le cookie sentinelle
 * `loggedIn:` que lit `hasLoggedInCookie()`, plus les deux réponses réseau
 * que `SessionManager.loadSession()` et `useOnboardingState()` attendent.
 * Rien d'autre n'est mocké : les autres appels (crédits, espaces à
 * rejoindre) échouent contre le port mort exactement comme pour un visiteur
 * anonyme, et le code les tolère déjà (`.catch(() => null)`, `enabled: !!user`
 * bypassé par `isRefresh`).
 */

const VIEWPORT = { width: 375, height: 812 }
const MIN_TARGET_PX = 44

// Doit rester égal à WEB_PORT dans `playwright.config.ts` — c'est l'origine
// sur laquelle `vite preview` sert `apps/web`, la seule à qui poser le
// cookie sentinelle AVANT la navigation (il doit être lisible dès le premier
// rendu, pas ajouté après coup).
const WEB_ORIGIN = 'http://127.0.0.1:4311'

const ONBOARDING_USER_ID = '4b7a4b1e-2222-4a11-9c33-7c1c9a2f9001'

/**
 * Simule un compte dont le questionnaire est marqué `completed` mais dont
 * des sous-étapes n'ont JAMAIS été posées — l'entrée `resume` de
 * `resolveOnboardingEntry` (`onboarding-gate.ts`), celle qui affiche le
 * bouton « Compléter mon profil » nommé par #2639.1. `answers: {}` suffit :
 * `unreachedSubSteps` lit chaque sous-étape comme non répondue dès que la
 * clé est absente.
 */
async function mockAuthenticatedOnboardingResume(page: Page): Promise<void> {
  await page.context().addCookies([{ name: `loggedIn:${ONBOARDING_USER_ID}`, value: '1', url: WEB_ORIGIN }])

  await page.route('**/auth/session', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: ONBOARDING_USER_ID,
          email: 'e2e-mobile@bellum-ai.com',
          created_at: '2026-01-01T00:00:00.000Z',
          roles: ['customer'],
        },
      }),
    }),
  )

  await page.route('**/onboarding/state', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        id: ONBOARDING_USER_ID,
        status: 'completed',
        current_stage_code: null,
        stages: [],
        answers: {},
        skipped_at: null,
        inherited_answer_keys: [],
        active_import_session_id: null,
        joined_workspace: null,
        effectif_observed_at: {},
      }),
    }),
  )
}

type ScreenCase = {
  path: string
  label: string
  buttonName: string
  setup?: (page: Page) => Promise<void>
}

const SCREENS: ScreenCase[] = [
  {
    path: '/onboarding',
    label: 'onboarding — bouton de reprise (#2639.1)',
    buttonName: 'Compléter mon profil',
    setup: mockAuthenticatedOnboardingResume,
  },
  {
    path: '/signup',
    label: 'création de compte',
    buttonName: 'Continuer avec Google',
  },
  {
    path: '/forgot-password',
    label: 'mot de passe oublié',
    buttonName: 'Envoyer le lien',
  },
]

test.describe('portée d’écran mobile 375×812 — #2639.1 et sa famille', () => {
  for (const screen of SCREENS) {
    test(`${screen.label} : bouton atteignable, cible ≥ 44px, pas de défilement horizontal`, async ({ page }) => {
      if (screen.setup) await screen.setup(page)
      await page.goto(screen.path)

      const button = page.getByRole('button', { name: screen.buttonName })
      await expect(button).toBeVisible()

      // 1. Atteignable — un VRAI défilement de la page (molette), jamais un
      // scrollIntoView() scripté qui pourrait forcer un conteneur
      // `overflow: hidden`. Le curseur se place au centre du viewport avant
      // de défiler, comme le ferait un doigt ou une molette réels.
      await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2)
      for (let i = 0; i < 15; i += 1) {
        await page.mouse.wheel(0, 800)
      }

      const box = await button.boundingBox()
      if (!box) throw new Error(`[${screen.label}] le bouton "${screen.buttonName}" a disparu du DOM après défilement`)

      expect(
        box.y,
        `[${screen.label}] le bouton "${screen.buttonName}" est AU-DESSUS du viewport après défilement (y=${box.y})`,
      ).toBeGreaterThanOrEqual(0)
      expect(
        box.y + box.height,
        `[${screen.label}] le bouton "${screen.buttonName}" reste hors du viewport (${VIEWPORT.height}px) même après un défilement réel de la page — un conteneur \`overflow: hidden\` l'emprisonne probablement (bas mesuré à ${box.y + box.height}px)`,
      ).toBeLessThanOrEqual(VIEWPORT.height)

      // 2. Cible ≥ 44 px dans les deux dimensions (garde GA-32).
      expect(
        box.width,
        `[${screen.label}] la cible "${screen.buttonName}" fait ${box.width}px de large — sous les 44px de GA-32`,
      ).toBeGreaterThanOrEqual(MIN_TARGET_PX)
      expect(
        box.height,
        `[${screen.label}] la cible "${screen.buttonName}" fait ${box.height}px de haut — sous les 44px de GA-32`,
      ).toBeGreaterThanOrEqual(MIN_TARGET_PX)

      // 3. Aucun défilement horizontal du corps.
      const { scrollWidth, innerWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }))
      expect(
        scrollWidth,
        `[${screen.label}] le corps déborde horizontalement (scrollWidth=${scrollWidth} > innerWidth=${innerWidth})`,
      ).toBeLessThanOrEqual(innerWidth)
    })
  }
})
