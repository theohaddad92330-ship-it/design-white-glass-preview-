import { expect, test, type Page } from '@playwright/test'

/**
 * #2208.36 (golden journey 5) — OUVRIR LE VIVIER.
 *
 * Le tri du 28/09 (`TRI-RESTES-28-09.md`, #2958.32-.70) compte trente-neuf
 * golden journeys produit distincts sans scénario e2e dédié. Celui-ci est le
 * plus simple des trois qui touchent le Vivier (#2208.36/.37/.38 — ouvrir,
 * consulter un consultant, valider sa disponibilité) : ouvrir l'écran, voir
 * le vivier RÉEL (pas un tableau vide), et VRAIMENT chercher un profil par
 * le champ dédié — pas une mesure de mise en page (`vivier-table-layout.spec.ts`
 * couvre déjà la géométrie du tableau, jamais le fait de chercher).
 *
 * Mêmes mocks que `vivier-table-layout.spec.ts` (session, onboarding,
 * workspace, credits, `GET /talents?…`, `GET /delivery/propagation`) —
 * `TalentStatsBanner` et `MissingExpertisePanel` s'affichent sans données
 * supplémentaires dans ce spec déjà vert, la preuve qu'aucun autre appel
 * n'est nécessaire pour que l'écran se rende.
 *
 * La recherche (`#vivier-search-input`, #2182.14) part sur le VRAI paramètre
 * `q` de `GET /talents` (`consultants/api.ts:148`) : le mock filtre lui-même
 * par nom, jamais une supposition sur ce qu'un filtrage client ferait.
 */

const WEB_ORIGIN = 'http://127.0.0.1:4311'
const USER_ID = '4b7a4b1e-3333-4a11-9c33-2208360000ab'

type Talent = Record<string, unknown> & { id: string; fullName: string | null }

function talent(overrides: Record<string, unknown>): Talent {
  return {
    id: '00000000-0000-4000-8000-000000000000',
    kind: 'candidate',
    fullName: null,
    title: null,
    seniority: 'inconnu',
    declaredAvailability: 'unknown',
    staffing: { availability: 'unknown', loadPercent: 0, freeFrom: null, assignments: 0 },
    tjm: null,
    minTjmCents: null,
    costCents: null,
    financeVisible: false,
    contractType: 'inconnu',
    engagementKind: 'inconnu',
    zones: [],
    lastMission: null,
    submissions: { open: 0, total: 0 },
    source: null,
    lastContactAt: null,
    archivedAt: null,
    reviewStatus: 'qualified',
    topSkills: [],
    skillCount: 0,
    hasCv: true,
    workMode: null,
    photoUrl: null,
    updatedAt: '2026-09-20T10:00:00.000Z',
    ...overrides,
  } as Talent
}

const ROWS: Talent[] = [
  talent({
    id: '11111111-1111-4111-8111-111111111111',
    kind: 'consultant',
    fullName: 'Bastien Colin',
    title: 'Ingénieur DevOps',
    seniority: 'senior',
    declaredAvailability: 'immediate',
    staffing: { availability: 'available', loadPercent: 0, freeFrom: null, assignments: 0 },
  }),
  talent({
    id: '22222222-2222-4222-8222-222222222222',
    kind: 'consultant',
    fullName: 'Marie-Hélène Dupont-Lefebvre',
    title: 'Architecte solutions data',
    seniority: 'expert',
    declaredAvailability: 'immediate',
    staffing: { availability: 'busy', loadPercent: 100, freeFrom: '2026-12-31', assignments: 1 },
  }),
  talent({
    id: '33333333-3333-4333-8333-333333333333',
    kind: 'candidate',
    fullName: 'Inès Fontaine',
    title: 'AI Engineer',
    reviewStatus: 'needs_review',
  }),
]

async function mockVivier(page: Page): Promise<void> {
  await page.context().addCookies([{ name: `loggedIn:${USER_ID}`, value: '1', url: WEB_ORIGIN }])
  await page.route('**/auth/session', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: USER_ID,
          email: 'e2e-2208-36@bellum-ai.com',
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
        workspace: { id: '9b1c2d3e-4f50-4a61-8b72-220836000001', name: 'ESN e2e', role: 'owner', memberCount: 1 },
        members: [],
      }),
    }),
  )
  await page.route('**/credits', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ features: ['talent_pool'] }) }),
  )
  // Le VRAI paramètre de recherche (`q`, `consultants/api.ts:148`) : un
  // mock qui l'ignorerait ne prouverait rien de la recherche elle-même.
  await page.route(/\/talents\?/, route => {
    const url = new URL(route.request().url())
    const q = (url.searchParams.get('q') ?? '').trim().toLowerCase()
    const rows = q ? ROWS.filter(row => (row.fullName as string | null)?.toLowerCase().includes(q)) : ROWS
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ items: rows, total: rows.length, page: 1, limit: 20 }),
    })
  })
  await page.route('**/delivery/propagation', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ accounts: [], contacts: [], consultants: [] }),
    }),
  )
}

test.describe('#2208.36 — golden journey : ouvrir le Vivier', () => {
  test('ouvre le Vivier, voit les profils réels, cherche un profil par nom', async ({ page }) => {
    await mockVivier(page)

    await page.goto('/consultants')

    // ÉCRAN 1 — l'écran s'annonce lui-même (h1, #2182.4/.5), pas un titre
    // d'entête générique : sans prénom mocké, la formule sans prénom s'affiche.
    await expect(page.getByRole('heading', { name: 'Ton vivier' })).toBeVisible()

    // Le vivier réel se rend — pas un tableau vide, pas un état de chargement bloqué.
    await expect(page.locator('table tbody tr')).toHaveCount(ROWS.length, { timeout: 30_000 })
    await expect(page.getByText('Bastien Colin')).toBeVisible()
    await expect(page.getByText('Marie-Hélène Dupont-Lefebvre')).toBeVisible()

    // Le CTA d'entête « Chercher un profil » amène au VRAI champ de recherche
    // (id stable `vivier-search-input`, #2182.14) — pas un second moteur.
    await page.getByRole('button', { name: 'Chercher un profil' }).click()
    const search = page.locator('#vivier-search-input')
    await expect(search).toBeFocused()

    // LA RECHERCHE — un vrai clavier, un vrai paramètre `q`, un résultat qui
    // change VRAIMENT (pas un filtrage client sur des données déjà là).
    await search.fill('Bastien')
    await expect(page.locator('table tbody tr')).toHaveCount(1, { timeout: 10_000 })
    await expect(page.getByText('Bastien Colin')).toBeVisible()
    await expect(page.getByText('Marie-Hélène Dupont-Lefebvre')).not.toBeVisible()

    // Vider la recherche restaure le vivier complet — rien ne reste filtré en silence.
    await search.fill('')
    await expect(page.locator('table tbody tr')).toHaveCount(ROWS.length, { timeout: 10_000 })
  })

  test('une recherche sans correspondance dit « aucun talent », jamais un tableau vide muet', async ({ page }) => {
    await mockVivier(page)
    await page.goto('/consultants')
    await expect(page.locator('table tbody tr')).toHaveCount(ROWS.length, { timeout: 30_000 })

    // #3948 — les filtres vivent dans un panneau replié : le CTA l'ouvre.
    await page.getByRole('button', { name: 'Chercher un profil' }).click()
    await page.locator('#vivier-search-input').fill('Zzzznomqui n’existe pas')
    await expect(page.getByText('Aucun talent ne correspond')).toBeVisible({ timeout: 10_000 })
  })
})
