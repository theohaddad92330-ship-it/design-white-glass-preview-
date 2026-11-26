import { expect, test, type Page } from '@playwright/test'

/**
 * #2446.18 — GOLDEN JOURNEY : PROSPECTION JUSQU'À LA TRACE CRM.
 *
 * L'épopée #2773 demande cinq parcours bout-en-bout PROUVÉS À L'ÉCRAN. Ce
 * fichier prouve la tranche la MIEUX comprise du parcours « prospection » —
 * même famille de risque que #2446.15 (`golden-journey-first-approach.spec.ts`) :
 * partir d'un dossier compte déjà mappé mock par mock, plutôt que d'ouvrir une
 * cartographie neuve sur un écran de plusieurs centaines de lignes (`/chat`,
 * `ContactContent.tsx`) sans pouvoir la vérifier par un vrai build Playwright
 * ce tour — un e2e non vérifié serait le FAUX ROUGE que ce chantier refuse
 * explicitement (voir les bilans précédents de #2773).
 *
 * Le geste PROUVÉ : depuis le dossier compte, ouvrir l'onglet Contacts (VRAI
 * clic client-side, section « Contacts »), déclarer l'issue d'une approche
 * sur un contact (`ContactOutcomeSubmenu`, `PATCH /contacts/:id/status`) —
 * c'est CE geste qui écrit la trace CRM (journal d'activité, compteurs
 * `response_received`/`rdv_obtained`, voir `useUpdateContactStatus.ts`) —
 * et vérifier que le statut affiché change réellement à l'écran.
 *
 * Reste HORS de ce fichier (non cartographié ce tour, honnête plutôt que
 * deviné) : la lecture de la trace elle-même dans un journal d'activité dédié
 * (aucun onglet « Journal » n'existe dans le dossier compte aujourd'hui — la
 * preuve de la trace, ici, est le changement de statut affiché, pas une
 * seconde lecture d'un écran qui n'existe pas).
 *
 * Mêmes mocks de base que `golden-journey-first-approach.spec.ts` (session,
 * onboarding, workspace, credits, `GET /accounts/:id`), plus `GET
 * /accounts/hygiene` (lu par l'onglet Contacts, `useAccountsHygiene`) et
 * `PATCH /contacts/:id/status` (le geste testé).
 */

const WEB_ORIGIN = 'http://127.0.0.1:4311'
const USER_ID = '9a1b2c3d-6666-4e11-8f33-2446180000be'
const ACCOUNT_ID = '2446af18-6666-4b22-8d44-2446af18e001'
const ACCOUNT_NAME = 'Compagnie de Démonstration Golden Journey CRM'
const CONTACT_ID = '2446af18-6666-4b22-8d44-2446af18c001'
const CONTACT_NAME = 'Julie Petit'

const ACCOUNT = {
  id: ACCOUNT_ID,
  user_id: USER_ID,
  company_name: ACCOUNT_NAME,
  siren: '552100988',
  sector: 'Édition de logiciels',
  employees: '250-499',
  revenue: '50-100M€',
  headquarters: 'Nantes, France',
  website: 'https://demo-2446-crm.example.com',
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

const CONTACT = {
  id: CONTACT_ID,
  account_id: ACCOUNT_ID,
  full_name: CONTACT_NAME,
  title: 'Directrice des Systèmes d’Information',
  entity: null,
  decision_role: 'decision_maker',
  priority: 5,
  email: 'julie.petit@demo-2446-crm.example.com',
  email_verified: true,
  phone: null,
  linkedin_url: null,
  locale: null,
  photo_url: null,
  profile_summary: null,
  why_contact: null,
  email_message: null,
  linkedin_message: null,
  phone_script: null,
  followup_message: null,
  user_status: 'new',
  email_sent_at: null,
  source: 'apollo',
  raw_data: null,
  note: null,
  hidden: false,
  excluded_at: null,
  exclusion_reason: null,
  identity_confirmed_at: null,
  created_at: '2026-09-01T10:00:00.000Z',
  updated_at: '2026-09-01T10:00:00.000Z',
}

async function mockAccountDossier(page: Page): Promise<void> {
  await page.context().addCookies([{ name: `loggedIn:${USER_ID}`, value: '1', url: WEB_ORIGIN }])
  await page.route('**/auth/session', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: USER_ID,
          email: 'e2e-2446-crm@bellum-ai.com',
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
        workspace: { id: '9b1c2d3e-4f50-4a61-8b72-2446af180001', name: 'ESN e2e', role: 'owner', memberCount: 1 },
        members: [],
      }),
    }),
  )
  await page.route('**/credits', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ features: [] }) }),
  )
  await page.route('**/accounts/hygiene', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({}) }),
  )
  await page.route(`**/accounts/${ACCOUNT_ID}`, route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(ACCOUNT) }),
  )
  await page.route(`**/contacts/account/${ACCOUNT_ID}`, route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify([CONTACT]) }),
  )
  await page.route(`**/contacts/${CONTACT_ID}/status`, route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ ...CONTACT, user_status: 'contacted' }),
    }),
  )
}

test.describe('#2446.18 — golden journey : intra-compte → déclarer une issue de prospection (trace CRM)', () => {
  test('depuis le dossier jusqu’au statut « Contacté », par un VRAI clic client-side', async ({ page }) => {
    await mockAccountDossier(page)

    await page.goto(`/accounts/${ACCOUNT_ID}?tab=overview`)

    // ÉCRAN 1 — le dossier ouvre sur l'aperçu.
    // 30 s : le premier rendu du dossier passe par le repli d'origine (API = port mort, GET en échec, rejeu par /api, coque remontée) sur un runner partagé ; 5 s cassait ce parcours sans qu'aucun code ait changé (même code vert à 07:01, rouge à 07:26 le 29/09).
    await expect(page.getByRole('heading', { name: ACCOUNT_NAME })).toBeVisible({ timeout: 30_000 })

    // LE CLIC — la section « Contacts » ouvre sa première sous-partie
    // visible (`openSection`, `AccountDetailTabsBar.tsx`) : l'onglet Contacts.
    // Client-side réel (TanStack Router), jamais un second `page.goto`.
    await page.getByRole('button', { name: 'Contacts', exact: true }).click()

    // ÉCRAN 2 — l'onglet Contacts, avec le contact du dossier. Les contacts
    // sont groupés par entité ; les groupes classés s’ouvrent dépliés, la ligne
    // (et son menu d’actions) est atteignable sans clic.
    await expect(page).toHaveURL(/[?&]tab=contacts/)
    await expect(page.getByText(CONTACT_NAME).first()).toBeVisible({ timeout: 30_000 })
    // Recette 21/10 A.1 — les groupes classés s'ouvrent DÉPLIÉS : le bouton dit « Tout replier ».
    await expect(page.getByRole('button', { name: 'Tout replier' })).toBeVisible()

    // #4292.19 — la carte « Chemin d'accès » dit « Classement en cours… » le temps que l'offre du profil soit posée,
    // puis se replie d'une ligne : un menu ouvert avant ce décalage glisse sous le pointeur et se referme. On attend
    // que le classement soit arrêté, comme le ferait un commercial qui lit avant de cliquer.
    await expect(page.getByText('Classement en cours…')).toHaveCount(0, { timeout: 30_000 })

    // LE GESTE — déclarer l'issue de l'approche : ouvrir le menu de la ligne,
    // puis le sous-menu « Où en est ce contact ? », puis choisir « Contacté ».
    await page.getByRole('button', { name: `Actions pour ${CONTACT_NAME}`, exact: true }).click()
    await page.getByText('Où en est ce contact ?').click()

    const patchRequest = page.waitForRequest(
      request => request.url().includes(`/contacts/${CONTACT_ID}/status`) && request.method() === 'PATCH',
    )
    await page.getByRole('menuitem', { name: 'Contacté' }).click()
    await patchRequest

    // ÉCRAN 3 — la trace est écrite : le toast de confirmation
    // (`contacts:status.updated`, « {{name}} — {{status}} ») le prouve à
    // l'écran, jamais seulement une requête partie sans preuve visible.
    // ⚠️ Pas le badge de la ligne : `useUpdateContactStatus` invalide la liste
    // du compte en `refetchType: 'inactive'` (le tableau de bord la relit
    // fraîche à la prochaine visite) — la liste ACTIVE, elle, ne se
    // rafraîchit pas toute seule tant qu'on reste sur cet écran.
    await expect(page.getByText('Julie Petit — Contacté')).toBeVisible()
  })
})
