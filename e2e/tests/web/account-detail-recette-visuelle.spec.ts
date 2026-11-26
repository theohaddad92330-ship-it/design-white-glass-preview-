import { expect, test, type Page } from '@playwright/test'

/**
 * #2117.84 — RECETTE : DESKTOP, TABLETTE, MOBILE, MODE SOMBRE TESTÉS.
 *
 * Le dossier compte (`/accounts/:id?tab=overview`, #2117) n'avait aucune
 * recette tracée dans le dépôt (confirmé au registre le 22/09/2026 : « aucun
 * e2e/visuel trouvé »). Ce test la trace, au plus près du contrat réel : la
 * session et les deux appels dont `useAccount`/`useCurrentContact` ont besoin
 * pour peindre le hero (`GET /accounts/:id`, `GET /contacts/account/:id`) sont
 * simulés — voir `mockVivier` dans `vivier-table-layout.spec.ts` pour le même
 * motif. Tout le reste (coverage-gaps, liens, provenance, bandeau de revenu…)
 * échoue contre le port mort exactement comme pour un visiteur anonyme : ces
 * panneaux sont conçus pour ne rien rendre quand leur donnée est absente.
 *
 * Trois largeurs (desktop 1280, tablette 820, mobile 375 — mobile avec
 * `isMobile`/`hasTouch`, seul réglage qui active `@media (pointer: coarse)`,
 * voir `screen-reach.spec.ts`), en clair ET en sombre (`localStorage['bellum-
 * theme']`, lu par `theme-provider.tsx` AVANT `prefers-color-scheme` — posé
 * par `addInitScript`, avant toute navigation, pour un rendu déterministe dès
 * le premier paint).
 *
 * Trois mesures, à chaque combinaison :
 *  1. aucun défilement horizontal du corps ;
 *  2. le contenu principal (l'identité du compte, portée par le hero) est
 *     visible ;
 *  3. aucun texte visible ne partage sa couleur avec son fond — pas une
 *     mesure de contraste AA (déjà la garde GA-33), la panne plus grossière
 *     qu'un thème mal recouvert produit : un token de texte non redéfini en
 *     sombre qui retombe sur la même valeur que le fond.
 */

const WEB_ORIGIN = 'http://127.0.0.1:4311'
const USER_ID = '7e2c9b1a-3333-4a11-9c33-2117008421be'
const ACCOUNT_ID = '2117af84-4444-4b22-8d44-2117af84e001'
const ACCOUNT_NAME = 'Compagnie Générale de Recette 2117'

const ACCOUNT = {
  id: ACCOUNT_ID,
  user_id: USER_ID,
  company_name: ACCOUNT_NAME,
  siren: '552100554',
  sector: 'Édition de logiciels',
  employees: '250-499',
  revenue: '50-100M€',
  headquarters: 'Lyon, France',
  website: 'https://recette-2117.example.com',
  subsidiaries: [],
  it_challenges: ['Migration cloud', 'Cybersécurité'],
  recent_signals: [],
  priority_score: 7,
  priority_justification: 'Compte prioritaire pour la recette #2117.84.',
  raw_analysis: null,
  status: 'completed',
  error_message: null,
  user_context: null,
  api_cost_euros: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-09-20T10:30:00Z',
}

async function mockAccountDetail(page: Page): Promise<void> {
  await page.context().addCookies([{ name: `loggedIn:${USER_ID}`, value: '1', url: WEB_ORIGIN }])
  await page.route('**/auth/session', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: USER_ID,
          email: 'e2e-2117@bellum-ai.com',
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
        id: USER_ID,
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
  await page.route('**/workspaces/me', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        workspace: { id: '9b1c2d3e-4f50-4a61-8b72-2117af840001', name: 'ESN e2e', role: 'owner', memberCount: 1 },
        members: [],
      }),
    }),
  )
  await page.route('**/credits', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ features: [] }) }),
  )
  await page.route(`**/accounts/${ACCOUNT_ID}`, route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(ACCOUNT) }),
  )
  await page.route(`**/contacts/account/${ACCOUNT_ID}`, route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify([]) }),
  )
}

type ContrastViolation = { text: string; color: string; background: string }

/** Tout se mesure DANS la page, jamais une classe lue. */
async function measure(page: Page): Promise<{
  scrollWidth: number
  innerWidth: number
  contrastViolations: ContrastViolation[]
}> {
  return page.evaluate(() => {
    const isRenderedColor = (value: string) =>
      value && value !== 'transparent' && value !== 'rgba(0, 0, 0, 0)' && !/^rgba\([^)]*,\s*0\)$/.test(value)

    /** Le fond effectif : le premier ancêtre (soi-même inclus) qui en pose un. */
    const effectiveBackground = (element: Element): string => {
      let current: Element | null = element
      while (current) {
        const bg = getComputedStyle(current).backgroundColor
        if (isRenderedColor(bg)) return bg
        current = current.parentElement
      }
      return getComputedStyle(document.body).backgroundColor
    }

    const violations: ContrastViolation[] = []
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = (node.textContent ?? '').trim()
      if (!text) continue
      const parent = node.parentElement
      if (!parent) continue
      const style = getComputedStyle(parent)
      if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) continue
      const range = document.createRange()
      range.selectNodeContents(node)
      const rect = range.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue

      const color = style.color
      const background = effectiveBackground(parent)
      if (color === background) {
        violations.push({ text: text.slice(0, 60), color, background })
      }
    }

    return {
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      contrastViolations: violations,
    }
  })
}

const SCENARIOS: Array<{
  label: string
  viewport: { width: number; height: number }
  isMobile?: boolean
  hasTouch?: boolean
}> = [
  { label: 'desktop 1280px', viewport: { width: 1280, height: 900 } },
  { label: 'tablette 820px', viewport: { width: 820, height: 1180 } },
  { label: 'mobile 375px', viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true },
]

for (const scenario of SCENARIOS) {
  for (const theme of ['light', 'dark'] as const) {
    test.describe(`#2117.84 — dossier compte, ${scenario.label}, thème ${theme}`, () => {
      test.use({
        viewport: scenario.viewport,
        ...(scenario.isMobile !== undefined ? { isMobile: scenario.isMobile } : {}),
        ...(scenario.hasTouch !== undefined ? { hasTouch: scenario.hasTouch } : {}),
        colorScheme: theme,
      })

      test(`pas de défilement horizontal, contenu principal visible, aucun texte invisible sur son fond`, async ({
        page,
      }) => {
        await mockAccountDetail(page)
        // `theme-provider.tsx` lit `localStorage['bellum-theme']` AVANT
        // `prefers-color-scheme` — poser la préférence stockée est le seul
        // moyen déterministe de forcer le thème dès le premier rendu.
        await page.addInitScript(t => localStorage.setItem('bellum-theme', t), theme)
        await page.goto(`/accounts/${ACCOUNT_ID}?tab=overview`)

        // Contenu principal visible : l'identité du compte, portée par le hero.
        await expect(page.getByText(ACCOUNT_NAME).first()).toBeVisible({ timeout: 30_000 })

        const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
        expect(isDark, `thème « ${theme} » pas appliqué sur <html>`).toBe(theme === 'dark')

        const { scrollWidth, innerWidth, contrastViolations } = await measure(page)

        expect(scrollWidth, `la page défile horizontalement (${scrollWidth} > ${innerWidth})`).toBeLessThanOrEqual(
          innerWidth,
        )
        expect(
          contrastViolations,
          contrastViolations
            .map(v => `« ${v.text} » : texte ${v.color} sur fond ${v.background} (identiques)`)
            .join('\n'),
        ).toEqual([])
      })
    })
  }
}
