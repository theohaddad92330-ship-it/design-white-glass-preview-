import { expect, test, type Page } from '@playwright/test'

/**
 * #2446.16 — GOLDEN JOURNEY : INTRA-COMPTE JUSQU'AU COMPTE RENDU DE RDV.
 *
 * L'épopée #2773 demande cinq parcours bout-en-bout PROUVÉS À L'ÉCRAN. Les
 * bilans précédents (voir les commentaires de #2773, lots du 25/09 au 27/09)
 * ont cartographié la chaîne compte → contacts → issue d'approche
 * (`ContactOutcomeSubmenu`, réutilisé par #2446.18) sans jamais atteindre la
 * DERNIÈRE étape — le compte rendu lui-même — faute d'avoir mappé
 * `MeetingNotesCard` mock par mock. Ce fichier ferme cette chaîne.
 *
 * Le geste PROUVÉ, en un seul parcours : depuis le dossier compte, ouvrir
 * l'onglet Contacts (VRAI clic client-side), déclarer qu'un rendez-vous a été
 * décroché (`ContactOutcomeSubmenu` → `PATCH /contacts/:id/status`, même
 * mécanisme que #2446.18) — puis basculer sur l'onglet Plan (VRAI clic
 * client-side, même contournement que #2446.15 : cliquer le NAV, pas le CTA
 * du hero), déplier la section « Préparer le rendez-vous » (repliée par
 * défaut, `CollapsedSection`), taper des notes, les structurer
 * (`POST /meeting-notes/cascade`) et valider l'écriture interne
 * (`POST /meeting-notes/cascade/approve`) — c'est CE clic qui écrit
 * réellement le compte rendu (§7.2, `onApprove`/`useApproveInternal`).
 *
 * `MeetingNotesCard` lit aussi `useCrmPresence` et `useMailboxStatus` (pour
 * proposer un stade CRM et un dépôt de brouillon de mail) : mockées « aucun
 * CRM, aucune messagerie connectée » pour rester dans le même périmètre que
 * le compte de démonstration des autres golden journeys — pas un test de
 * l'intégration CRM elle-même (hors de ce point).
 *
 * Mêmes mocks de base que `golden-journey-prospecting-to-crm-trace.spec.ts`
 * (session, onboarding, workspace, credits, `GET /accounts/:id`, `GET
 * /contacts/account/:id`, `GET /accounts/hygiene`, `PATCH
 * /contacts/:id/status`), plus les quatre endpoints propres au compte rendu.
 */

const WEB_ORIGIN = 'http://127.0.0.1:4311'
const USER_ID = '9a1b2c3d-7777-4e11-8f33-2446160000be'
const ACCOUNT_ID = '2446af16-7777-4b22-8d44-2446af16e001'
const ACCOUNT_NAME = 'Compagnie de Démonstration Golden Journey RDV'
const CONTACT_ID = '2446af16-7777-4b22-8d44-2446af16c001'
const CONTACT_NAME = 'Marc Lefèvre'

const ACCOUNT = {
  id: ACCOUNT_ID,
  user_id: USER_ID,
  company_name: ACCOUNT_NAME,
  siren: '552100989',
  sector: 'Édition de logiciels',
  employees: '250-499',
  revenue: '50-100M€',
  headquarters: 'Nantes, France',
  website: 'https://demo-2446-rdv.example.com',
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
  title: 'Directeur des Opérations',
  entity: null,
  decision_role: 'decision_maker',
  priority: 5,
  email: 'marc.lefevre@demo-2446-rdv.example.com',
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
  user_status: 'replied',
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

/** Le compte rendu que `POST /meeting-notes/cascade` renvoie — une seule
 *  sortie sourcée (`recap`, notes tapées) : le cas le plus simple qui produit
 *  malgré tout une carte réelle, jamais un compte rendu vide. */
const RECAP = {
  summary: 'Marc confirme un besoin de renfort DevOps pour le trimestre à venir, budget déjà arbitré.',
  decisions: ['Rendez-vous de cadrage technique posé pour la semaine prochaine.'],
  nextSteps: [],
  openQuestions: [],
  signals: [],
  followUpEmail: '',
  opportunity: null,
  need: null,
  clientIssue: null,
  mentionedContacts: [],
  crmStage: null,
  reminder: null,
  learnings: [],
  facts: [],
  requests: [],
  criteria: [],
  dates: [],
  clientCommitments: [],
  userCommitments: [],
  recapEvidence: { kind: 'notes-derived' },
  followUpEvidence: null,
  sources: [{ kind: 'notes', detail: '' }],
  sourceEventId: null,
  estimatedCredits: null,
}

const CASCADE = {
  cards: [
    {
      kind: 'recap',
      position: 1,
      band: 'a1',
      state: 'to_validate',
      itemCount: 1,
      evidence: [{ kind: 'notes-derived' }],
      reachesOutside: false,
    },
  ],
  summary: {
    internalWrites: [{ kind: 'recap', count: 1 }],
    externalDrafts: [],
    estimatedCredits: null,
    sources: [{ kind: 'notes', detail: '' }],
    droppedWithoutEvidence: 0,
  },
}

async function mockAccountDossier(page: Page): Promise<void> {
  await page.context().addCookies([{ name: `loggedIn:${USER_ID}`, value: '1', url: WEB_ORIGIN }])
  await page.route('**/auth/session', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: USER_ID,
          email: 'e2e-2446-rdv@bellum-ai.com',
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
        workspace: { id: '9b1c2d3e-4f50-4a61-8b72-2446af160001', name: 'ESN e2e', role: 'owner', memberCount: 1 },
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
      body: JSON.stringify({ ...CONTACT, user_status: 'meeting' }),
    }),
  )
  // ── Ce que `MeetingNotesCard` lit, une fois la section dépliée ────────────
  await page.route('**/meeting-notes/status', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ available: false }) }),
  )
  await page.route('**/crm/presence?*', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        provider: null,
        matched: false,
        contactsCount: 0,
        contacts: [],
        openDeals: [],
        lastActivityAt: null,
      }),
    }),
  )
  await page.route('**/mailbox/status', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        connected: false,
        capabilities: { read: false, draft: false, send: false, labels: false, outOfOffice: false },
        connectedCount: 0,
      }),
    }),
  )
  await page.route('**/meeting-notes/cascade', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ recap: RECAP, cascade: CASCADE }),
    }),
  )
  await page.route('**/meeting-notes/cascade/approve', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ outcomes: [{ kind: 'recap', outcome: 'done', missing: null, detail: null }] }),
    }),
  )
}

test.describe('#2446.16 — golden journey : intra-compte → compte rendu de rendez-vous', () => {
  test('déclarer un rendez-vous décroché, puis structurer et valider le compte rendu', async ({ page }) => {
    await mockAccountDossier(page)

    await page.goto(`/accounts/${ACCOUNT_ID}?tab=overview`)

    // ÉCRAN 1 — le dossier ouvre sur l'aperçu.
    // 30 s : le premier rendu du dossier passe par le repli d'origine (API = port mort, GET en échec, rejeu par /api, coque remontée) sur un runner partagé ; 5 s cassait ce parcours sans qu'aucun code ait changé (même code vert à 07:01, rouge à 07:26 le 29/09).
    await expect(page.getByRole('heading', { name: ACCOUNT_NAME })).toBeVisible({ timeout: 30_000 })

    // R22 a4 — la section « Personnes » s'appelle « Contacts » (tabSections.people).
    // ÉTAPE A — déclarer l'issue « rendez-vous décroché » sur le contact,
    // exactement le même geste que #2446.18 (`ContactOutcomeSubmenu`).
    await page.getByRole('button', { name: 'Contacts', exact: true }).click()
    await expect(page).toHaveURL(/[?&]tab=contacts/)
    await expect(page.getByText(CONTACT_NAME).first()).toBeVisible({ timeout: 30_000 })
    // Recette 21/10 A.1 — les groupes classés s'ouvrent DÉPLIÉS : le bouton dit « Tout replier ».
    await expect(page.getByRole('button', { name: 'Tout replier' })).toBeVisible()

    await page.getByRole('button', { name: `Actions pour ${CONTACT_NAME}`, exact: true }).click()
    await page.getByText('Où en est ce contact ?').click()

    const statusPatch = page.waitForRequest(
      request => request.url().includes(`/contacts/${CONTACT_ID}/status`) && request.method() === 'PATCH',
    )
    await page.getByRole('menuitem', { name: 'Rendez-vous décroché' }).click()
    await statusPatch

    // ÉCRAN 2 — la trace du rendez-vous décroché est écrite (même preuve que
    // #2446.18 : le toast, pas le badge de la ligne qui ne se rafraîchit pas
    // seul tant qu'on reste sur cet écran).
    await expect(page.getByText(`${CONTACT_NAME} — Rendez-vous décroché`)).toBeVisible()

    // ÉTAPE B — basculer sur l'onglet Plan. Client-side réel (TanStack
    // Router), par la nav « Sections du dossier » — jamais le CTA du hero
    // (voir #2446.15 : `activeTab` ne resynchronise pas depuis l'URL).
    await page.getByRole('button', { name: "Plan d'action", exact: true }).click()
    await expect(page).toHaveURL(/[?&]tab=plan/)
    await expect(page.getByText('Aucune action dans le plan')).toBeVisible()

    // ÉTAPE C — déplier la section « Préparer le rendez-vous », repliée par
    // défaut (`CollapsedSection`, invariant #1795/#1808/#1809/#1813).
    await page.getByRole('button', { name: 'Préparer le rendez-vous' }).click()
    await expect(page.getByText('Compte rendu de rendez-vous')).toBeVisible()

    // ÉTAPE D — taper des notes, les structurer.
    await page
      .getByPlaceholder('Tes notes brutes, telles que tu les as prises.')
      .fill('Marc confirme un besoin de renfort DevOps, budget déjà arbitré. RDV technique la semaine prochaine.')

    const cascadeRequest = page.waitForRequest(
      request => request.url().includes('/meeting-notes/cascade') && request.method() === 'POST',
    )
    await page.getByRole('button', { name: 'Structurer', exact: true }).click()
    await cascadeRequest

    // ÉCRAN 3 — le compte rendu structuré est affiché : la carte « Compte
    // rendu structuré » (`outputs.recap`), sourcée par les notes tapées.
    await expect(page.getByText('Compte rendu structuré')).toBeVisible()
    await expect(page.getByText(RECAP.summary)).toBeVisible()

    // ÉTAPE E — LE GESTE QUI ÉCRIT RÉELLEMENT LE COMPTE RENDU : valider
    // l'écriture interne (`POST /meeting-notes/cascade/approve`), jamais une
    // action externe (aucun brouillon de mail, aucune relance dans ce lot).
    const approveRequest = page.waitForRequest(
      request => request.url().includes('/meeting-notes/cascade/approve') && request.method() === 'POST',
    )
    await page.getByRole('button', { name: 'Valider 1 écriture interne', exact: true }).click()
    await approveRequest

    // ÉCRAN 4 — la preuve que l'écriture a eu lieu : « Écrit. », jamais un
    // état `proposed`/`blocked`/`skipped` qu'on confondrait avec un fait.
    await expect(page.getByText('Écrit.')).toBeVisible()
  })
})
