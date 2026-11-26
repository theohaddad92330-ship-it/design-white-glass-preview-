import { expect, test, type Page } from '@playwright/test'

/**
 * #2446.15 — GOLDEN JOURNEY : DÉCOUVERTE COMMERCIALE JUSQU'À LA PREMIÈRE APPROCHE.
 *
 * L'épopée #2773 demande cinq parcours bout-en-bout PROUVÉS À L'ÉCRAN, pas un
 * écran isolé. Le registre (vérifié le 25/09/2026) confirme qu'aucun e2e ne
 * relie encore deux écrans : `e2e/tests/web/` ne contenait que des specs
 * isolées (login, onboarding, vivier, dossier compte — recette visuelle
 * SEULE, jamais un clic entre deux écrans).
 *
 * Ce fichier prouve la PREMIÈRE moitié d'un parcours réel avec un vrai clic
 * client-side (TanStack Router, jamais un second `page.goto`) : le hero du
 * dossier compte, à l'état « aucun plan encore préparé » (`no-plan`,
 * `heroPrimaryAction.ts`), propose « Préparer le plan » ; la navigation
 * « Sections du dossier » mène réellement à l'onglet Plan vide (#2107,
 * `ActionPlanBoard`, absence `no-actions`) — la première approche que le
 * commercial doit préparer.
 *
 * ⚠️ TROUVÉ EN ÉCRIVANT CE PARCOURS, PAS ENCORE CORRIGÉ (reste, tranché sans
 * Louis) — le clic sur LE BOUTON DU HERO lui-même (« Préparer le plan »,
 * `AccountDetailHeroPrimaryAction.goToTab`) pose bien `?tab=plan` dans l'URL,
 * mais ne bascule PAS le panneau visible : `AccountDetail.tsx` resynchronise
 * `activeTab` (état LOCAL) depuis l'URL une seule fois par compte
 * (`syncedAccountId`, commentaire `#2479`), jamais à chaque changement de
 * `?tab=` en cours de visite — seul `handleTabChange` (les boutons de
 * « Sections du dossier ») met à jour `activeTab` directement. Mesuré ici :
 * après le clic sur le hero, l'URL contient `tab=plan` mais l'onglet Synthèse
 * reste affiché. Aucun test existant (`AccountDetailHeroPrimaryAction.test.tsx`)
 * ne le couvre — il vérifie que `navigate` est APPELÉ, jamais que l'écran
 * change réellement. Ce fichier documente le contournement (cliquer le NAV,
 * pas le hero) plutôt que de le corriger : c'est un changement de
 * `AccountDetail.tsx` qui dépasse ce lot.
 *
 * ⚠️ CE QUE CE FICHIER NE COUVRE PAS NON PLUS (reste, tranché sans Louis) —
 * la moitié DÉCOUVERTE (liste `/accounts` → clic sur une ligne → ce dossier) :
 * la liste compose une dizaine de hooks/endpoints (`useAccountsPortfolioBand`,
 * `useAccountBillingLens`, `useAccessSummary`…) que ce lot n'a pas eu le temps
 * de cartographier un par un sans risquer un mock incomplet — un e2e qui reste
 * bloqué en chargement infini serait un FAUX ROUGE pire qu'un point non
 * couvert. Ce fichier part directement du dossier déjà ouvert
 * (`/accounts/:id?tab=overview`), la moitié « intra-compte » du parcours.
 *
 * Mêmes mocks EXACTS que `account-detail-recette-visuelle.spec.ts` (session,
 * onboarding, workspace, credits, `GET /accounts/:id`, `GET
 * /contacts/account/:id`) — le hero et l'onglet Plan ne lisent RIEN d'autre :
 * `TabPlan.tsx` dérive son contenu de `account.raw_analysis`, déjà dans la
 * même réponse mockée, jamais un second appel réseau.
 */

const WEB_ORIGIN = 'http://127.0.0.1:4311'
const USER_ID = '9a1b2c3d-5555-4e11-8f33-2446150000be'
const ACCOUNT_ID = '2446af15-5555-4b22-8d44-2446af15e001'
const ACCOUNT_NAME = 'Compagnie de Démonstration Golden Journey'

const ACCOUNT = {
  id: ACCOUNT_ID,
  user_id: USER_ID,
  company_name: ACCOUNT_NAME,
  siren: '552100987',
  sector: 'Édition de logiciels',
  employees: '250-499',
  revenue: '50-100M€',
  headquarters: 'Nantes, France',
  website: 'https://demo-2446.example.com',
  subsidiaries: [],
  it_challenges: [],
  recent_signals: [],
  priority_score: null,
  priority_justification: null,
  raw_analysis: null,
  status: 'completed',
  error_message: null,
  user_context: null,
  api_cost_euros: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-09-25T10:30:00Z',
}

async function mockAccountDossier(page: Page): Promise<void> {
  await page.context().addCookies([{ name: `loggedIn:${USER_ID}`, value: '1', url: WEB_ORIGIN }])
  await page.route('**/auth/session', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: USER_ID,
          email: 'e2e-2446@bellum-ai.com',
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
        workspace: { id: '9b1c2d3e-4f50-4a61-8b72-2446af150001', name: 'ESN e2e', role: 'owner', memberCount: 1 },
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

test.describe('#2446.15 — golden journey : intra-compte → première approche (plan)', () => {
  test('depuis le hero jusqu’à l’onglet Plan vide, par un VRAI clic client-side', async ({ page }) => {
    await mockAccountDossier(page)

    await page.goto(`/accounts/${ACCOUNT_ID}?tab=overview`)

    // ÉCRAN 1 — le dossier ouvre sur l'aperçu, avec l'identité du compte.
    // 30 s : le premier rendu du dossier passe par le repli d'origine (API = port mort, GET en échec, rejeu par /api, coque remontée) sur un runner partagé ; 5 s cassait ce parcours sans qu'aucun code ait changé (même code vert à 07:01, rouge à 07:26 le 29/09).
    await expect(page.getByRole('heading', { name: ACCOUNT_NAME })).toBeVisible({ timeout: 30_000 })

    // Le hero, sans plan préparé (`raw_analysis: null`), propose « Préparer le
    // plan » — le geste PRINCIPAL, pas une action secondaire ou de menu.
    await expect(page.getByRole('button', { name: 'Préparer le plan' })).toBeVisible()

    // LE CLIC — la navigation « Sections du dossier » (`handleTabChange`,
    // `AccountDetail.tsx`) est le mécanisme qui bascule réellement le panneau
    // visible : `activeTab` est un état LOCAL, resynchronisé depuis l'URL une
    // seule fois à l'arrivée sur le compte (`syncedAccountId`), jamais à
    // chaque changement de `?tab=` — un clic sur le CTA du hero pose la même
    // query mais ne rebascule pas le panneau tant que le compte ne change pas.
    // Client-side réel malgré tout (TanStack Router), jamais un second
    // `page.goto`.
    await page.getByRole('button', { name: "Plan d'action", exact: true }).click()

    // ÉCRAN 2 — l'URL a réellement changé d'onglet…
    await expect(page).toHaveURL(/[?&]tab=plan/)
    // …et le contenu réel de l'onglet Plan vide s'affiche : la première
    // approche à préparer, nommée, jamais un onglet qui reste blanc.
    await expect(page.getByText('Aucune action dans le plan')).toBeVisible()
    await expect(page.getByText('Crée une première action concrète pour rendre le plan exploitable.')).toBeVisible()
  })
})
