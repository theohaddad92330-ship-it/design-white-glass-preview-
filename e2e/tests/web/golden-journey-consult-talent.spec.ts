import { expect, test, type Page, type Route } from '@playwright/test'

/**
 * #2208.37 et #2208.38 (golden journeys 6 et 7) — CONSULTER UN CONSULTANT, puis
 * VALIDER SA DISPONIBILITÉ.
 *
 * Numérotation : `suffixe = numéro de la liste + 31`, la convention des bilans
 * précédents (`golden-journey-open-vivier.spec.ts` = journey 5 = `.36`).
 *
 * Un seul parcours, de bout en bout, comme le ferait un commercial : ouvrir le
 * Vivier → cliquer la ligne d'une personne → lire sa fiche (entête, onglet
 * Compétences) → « Valider la disponibilité ». La fiche appelle sept routes
 * (`GET /consultants/:id`, `/talents/:id/summary|skills|documents`,
 * `/consultants/:id/missions`, `/submissions?consultantId=`, `/consultants`) :
 * toutes sont mockées, aucune ne retombe en 404 silencieux.
 *
 * #2208.69 (journey 38, « Tester les permissions ») : même fiche, serveur qui REFUSE
 * l'écriture (403) — la raison réelle s'affiche, jamais « Disponibilité validée à l’instant. ».
 *
 * Deux faits de doctrine sont ASSERTÉS, pas seulement rendus :
 *  - les ANNÉES d'une compétence ne s'affichent que si elle est prouvée
 *    (mission/entretien), jamais sur une simple déclaration (#2185.35) ;
 *  - « Valider la disponibilité » réécrit la MÊME valeur déclarée via
 *    `POST /consultants/:id/availability/confirm` (le serveur bascule
 *    `availability_checked_at`) — corps VIDE : aucune valeur n'est renvoyée.
 */

const WEB_ORIGIN = 'http://127.0.0.1:4311'
const USER_ID = '4b7a4b1e-3333-4a11-9c33-2208370000ab'
const TALENT_ID = '11111111-1111-4111-8111-111111111111'

const TALENT_ROW = {
  id: TALENT_ID,
  kind: 'consultant',
  fullName: 'Bastien Colin',
  title: 'Ingénieur DevOps',
  seniority: 'senior',
  declaredAvailability: 'immediate',
  staffing: { availability: 'available', loadPercent: 0, freeFrom: null, assignments: 0 },
  tjm: null,
  financeVisible: false,
  contractType: 'cdi',
  engagementKind: 'salarie',
  zones: [],
  lastMission: null,
  submissions: { open: 0, total: 0 },
  source: null,
  lastContactAt: null,
  archivedAt: null,
  reviewStatus: 'qualified',
  topSkills: [{ skill: 'kubernetes', label: 'Kubernetes', level: 'confirme', source: 'mission' }],
  skillCount: 2,
  hasCv: false,
  workMode: null,
  photoUrl: null,
  updatedAt: '2026-09-20T10:00:00.000Z',
}

const TALENT = {
  id: TALENT_ID,
  workspace_id: 'w-1',
  kind: 'consultant',
  source: null,
  last_contact_at: null,
  archived_at: null,
  archived_reason: null,
  review_status: 'qualified',
  consent: { givenAt: null, expiresAt: null, basis: null },
  full_name: 'Bastien Colin',
  title: 'Ingénieur DevOps',
  seniority: 'senior',
  availability: 'immediate',
  available_from: null,
  contract_type: 'cdi',
  engagement_kind: 'salarie',
  partner_account_id: null,
  email: null,
  phone: null,
  public_profile_url: null,
  contact_visible: true,
  tjm: null,
  finance_visible: false,
  stack: ['Kubernetes'],
  sectors: [],
  zones: [],
  mobility: null,
  preferences: null,
  references: [],
  languages: [],
  clearances: [],
  wants: null,
  notes: null,
  cv_text: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-09-20T10:00:00.000Z',
}

function skill(overrides: Record<string, unknown>) {
  return {
    id: '00000000-0000-4000-8000-000000000000',
    skill: 'x',
    rawLabel: null,
    level: 'confirme',
    years: null,
    lastUsedYear: null,
    source: 'declared',
    createdAt: '2026-09-01T00:00:00.000Z',
    family: null,
    validatedLevel: null,
    certification: false,
    clientFeedback: null,
    inferred: false,
    validatedByConsultantAt: null,
    validatedByRecruiterAt: null,
    ...overrides,
  }
}

const SKILLS = [
  // Prouvée en mission : ses années se lisent.
  skill({
    id: '21111111-1111-4111-8111-111111111111',
    skill: 'kubernetes',
    rawLabel: 'Kubernetes',
    source: 'mission',
    years: 6,
  }),
  // Simple déclaration : le chiffre ne doit PAS s'afficher.
  skill({
    id: '22222222-2222-4222-8222-222222222222',
    skill: 'terraform',
    rawLabel: 'Terraform',
    source: 'declared',
    years: 9,
  }),
]

/** Une URL d'écran (`/consultants/:id` sur l'origine du SPA) n'est pas un appel d'API. */
const isPage = (route: Route) => route.request().resourceType() === 'document'

const FORBIDDEN_MESSAGE = 'Permission requise : records:write'

const json = (route: Route, body: unknown) =>
  route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) })

async function mockSession(page: Page): Promise<void> {
  await page.context().addCookies([{ name: `loggedIn:${USER_ID}`, value: '1', url: WEB_ORIGIN }])
  await page.route('**/auth/session', route =>
    json(route, {
      user: {
        id: USER_ID,
        email: 'e2e-2208-37@bellum-ai.com',
        created_at: '2026-01-01T00:00:00.000Z',
        roles: ['customer'],
      },
    }),
  )
  await page.route('**/onboarding/state', route =>
    json(route, {
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
  )
  await page.route('**/workspaces/me', route =>
    json(route, {
      workspace: { id: '9b1c2d3e-4f50-4a61-8b72-220837000001', name: 'ESN e2e', role: 'owner', memberCount: 1 },
      members: [],
    }),
  )
  await page.route('**/credits', route => json(route, { features: ['talent_pool'] }))
}

/** Les routes du Vivier ET de la fiche. Renvoie les corps de `PUT /consultants/:id`. */
async function mockTalentApi(page: Page, options: { forbidWrites?: boolean } = {}): Promise<{ puts: unknown[] }> {
  const puts: unknown[] = []
  await page.route(/\/talents\?/, route => json(route, { items: [TALENT_ROW], total: 1, page: 1, limit: 20 }))
  await page.route('**/delivery/propagation', route => json(route, { accounts: [], contacts: [], consultants: [] }))
  await page.route(`**/talents/${TALENT_ID}/summary`, route => json(route, TALENT_ROW))
  await page.route(`**/talents/${TALENT_ID}/skills`, route => json(route, { items: SKILLS }))
  await page.route(`**/talents/${TALENT_ID}/documents`, route => json(route, { items: [] }))
  await page.route(`**/consultants/${TALENT_ID}/missions`, route => json(route, { items: [] }))
  await page.route(/\/submissions\?/, route => json(route, { items: [], total: 0 }))
  await page.route('**/consultants', route => (isPage(route) ? route.fallback() : json(route, [TALENT])))
  await page.route(`**/consultants/${TALENT_ID}`, route => {
    if (isPage(route)) return route.fallback()
    if (route.request().method() === 'PUT') {
      puts.push(route.request().postDataJSON())
    }
    return json(route, TALENT)
  })
  // #2877 — la validation passe par POST /consultants/:id/availability/confirm (corps vide).
  await page.route(`**/consultants/${TALENT_ID}/availability/confirm`, route => {
    puts.push(route.request().postDataJSON())
    if (options.forbidWrites) {
      return route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ message: FORBIDDEN_MESSAGE }),
      })
    }
    return json(route, TALENT)
  })
  return { puts }
}

test.describe('#2208.37/.38 — golden journey : consulter un consultant, valider sa disponibilité', () => {
  test('du Vivier à la fiche, aux compétences, puis la disponibilité se valide', async ({ page }) => {
    await mockSession(page)
    const { puts } = await mockTalentApi(page)

    // Vivier → la ligne de la personne.
    await page.goto('/consultants')
    await expect(page.locator('table tbody tr')).toHaveCount(1, { timeout: 30_000 })
    await page
      .getByRole('link', { name: /Bastien Colin/ })
      .first()
      .click()

    // LA FICHE — l'identité vient de la fiche, pas d'un titre générique.
    await expect(page).toHaveURL(new RegExp(`/consultants/${TALENT_ID}`))
    await expect(page.getByRole('heading', { name: 'Bastien Colin' }).first()).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Ingénieur DevOps').first()).toBeVisible()

    // Compétences : le libellé écrit, la source nommée, les années seulement si prouvées.
    await page.getByRole('button', { name: 'Compétences', exact: true }).click()
    await expect(page.getByText('Kubernetes').first()).toBeVisible()
    await expect(page.getByText('Terraform').first()).toBeVisible()
    await expect(page.getByText('vu en mission').first()).toBeVisible()
    const kubernetes = page.locator('li', { hasText: 'Kubernetes' }).first()
    const terraform = page.locator('li', { hasText: 'Terraform' }).first()
    await expect(kubernetes).toContainText('6')
    await expect(terraform).not.toContainText('9')

    // VALIDER LA DISPONIBILITÉ — réécrit la même valeur déclarée, rien d'autre.
    // #2877 : le geste vit dans l'onglet Profil (plus dans l'en-tête).
    await page.getByRole('button', { name: 'Profil', exact: true }).click()
    await page.getByRole('button', { name: 'Valider la disponibilité' }).click()
    await expect(page.getByText('Disponibilité validée à l’instant.')).toBeVisible({ timeout: 10_000 })
    expect(puts).toHaveLength(1)
    expect(puts[0]).toEqual({})
  })
  test('#2208.69 (journey 38) — sans le droit d’écrire, la validation est REFUSÉE à voix haute, jamais un faux succès', async ({
    page,
  }) => {
    await mockSession(page)
    const { puts } = await mockTalentApi(page, { forbidWrites: true })

    await page.goto(`/consultants/${TALENT_ID}`)
    await expect(page.getByRole('heading', { name: 'Bastien Colin' }).first()).toBeVisible({ timeout: 30_000 })

    await page.getByRole('button', { name: 'Profil', exact: true }).click()
    await page.getByRole('button', { name: 'Valider la disponibilité' }).click()

    // Le serveur a refusé : la raison réelle s'affiche, le succès jamais.
    await expect(page.getByText(FORBIDDEN_MESSAGE)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Disponibilité validée à l’instant.')).toHaveCount(0)
    expect(puts).toHaveLength(1)

    // La fiche reste lisible : la lecture n'est pas retirée avec l'écriture.
    await expect(page.getByText('Ingénieur DevOps').first()).toBeVisible()
  })
})
