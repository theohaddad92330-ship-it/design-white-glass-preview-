import { expect, test, type Page, type Route } from '@playwright/test'

/**
 * #2446.17 / #2339.12 (golden journey 4) — BESOIN → CONSULTANT ENREGISTRÉ → RAPPROCHEMENT.
 *
 * Tranche prouvée de « besoin/talent jusqu'à la mission démarrée » : les deux
 * premiers gestes du parcours, sur l'écran RÉEL (build de production, vrai clic
 * client-side). Les étapes suivantes (proposition, entretien, signature,
 * démarrage de la mission) restent à relier un par un : voir le commentaire de
 * l'épopée #2773.
 *
 * Parcours : fiche d'un besoin → « Enregistrer un consultant » (la TROISIÈME
 * PORTE, en place, sans quitter le besoin) → `POST /consultants` → le panneau
 * propose « Lancer le rapprochement » → clic → on arrive sur `/projects/needs`
 * avec `?match=<besoin>`.
 *
 * Deux faits de doctrine sont ASSERTÉS, pas seulement rendus :
 *  - enregistrer une fiche ne POSITIONNE personne : aucun `POST /submissions`
 *    ne part (une proposition est envoyée à un client, le commercial la décide) ;
 *  - le coût annoncé du rapprochement est « aucun crédit débité ».
 *
 * La recherche du serveur n'est jamais appelée au réel : toute route non
 * listée ici répond une liste vide, et les routes écrites sont comptées.
 */

const WEB_ORIGIN = 'http://127.0.0.1:4311'
const API_ORIGIN = 'http://127.0.0.1:4599'
const USER_ID = '4b7a4b1e-3333-4a11-9c33-2208370000ab'
const NEED_ID = '22222222-2222-4222-8222-222222222222'
const ACCOUNT_ID = '33333333-3333-4333-8333-333333333333'
const CONSULTANT_NAME = 'Inès Marchand'

const NEED = {
  id: NEED_ID,
  title: 'Ingénieur DevOps Kubernetes',
  urgency: 'high',
  skills: [{ skill: 'kubernetes', label: 'Kubernetes' }],
  seniority: 'senior',
  headcount: 1,
  target_tjm_cents: 60000,
  start_on: null,
  duration_months: 6,
  location: 'Paris',
  contract_kind: 'freelance',
  deadline_at: null,
  status: 'open',
  status_reason: null,
  status_changed_at: null,
  source: null,
  provenance: null,
  owner_id: null,
  shortlist_count: 0,
  staffable: 'unknown',
  staffable_reason: null,
  project_id: null,
  project_label: null,
  project_stage: null,
  account_id: ACCOUNT_ID,
  account_name: 'Client Test',
  entity_id: null,
  entity_name: null,
}

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
  await page.route('**/credits', route => json(route, { features: ['needs', 'talent_pool'] }))
}

/** Les écritures vues, par « MÉTHODE chemin ». */
async function mockNeedApi(page: Page): Promise<{ writes: { key: string; body: unknown }[] }> {
  const writes: { key: string; body: unknown }[] = []
  // Enregistré en PREMIER : Playwright donne la priorité à la dernière route posée.
  await page.route(`${API_ORIGIN}/**`, route => json(route, { items: [], total: 0 }))
  await page.route(`${API_ORIGIN}/**`, route => {
    const request = route.request()
    const path = request.url().replace(API_ORIGIN, '')
    const method = request.method()
    if (method !== 'GET') writes.push({ key: `${method} ${path.split('?')[0]}`, body: request.postDataJSON() })
    if (method === 'POST' && path === '/consultants') {
      return json(route, { id: '44444444-4444-4444-8444-444444444444', full_name: CONSULTANT_NAME })
    }
    if (/\/projects\/needs\?/.test(path)) return json(route, { data: [NEED], total: 1 })
    if (/reverse-prospects/.test(path)) {
      return json(route, { needId: NEED_ID, location: null, skillTerms: [], unavailableReason: null, matches: [] })
    }
    if (/partner-briefs/.test(path)) return json(route, [])
    if (/workspaces\/members/.test(path)) return json(route, [])
    if (method === 'GET' && /\/(auth\/session|onboarding\/state|workspaces\/me|credits)$/.test(path)) {
      return route.fallback()
    }
    return json(route, { items: [], total: 0 })
  })
  return { writes }
}

test.describe('#2446.17 — golden journey 4 : du besoin au consultant enregistré, puis au rapprochement', () => {
  test('la fiche d’un besoin enregistre un consultant en place, propose le rapprochement, ne positionne personne', async ({
    page,
  }) => {
    const { writes } = await mockNeedApi(page)
    await mockSession(page)

    await page.goto(`/projects/needs/${NEED_ID}`)
    // Premier rendu de la fiche : l'hydratation du build de prod dépasse parfois 5 s sur le runner CI
    // (mesuré 5,4 s le 09/10) — même plafond que les autres parcours dorés.
    await expect(page.getByRole('heading', { name: 'Ingénieur DevOps Kubernetes' }).first()).toBeVisible({
      timeout: 30_000,
    })

    // Porte n°3 : le formulaire s'ouvre EN PLACE, le besoin reste sous les yeux.
    await page.getByRole('button', { name: 'Enregistrer un consultant' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('Ajouter un consultant')
    await dialog.getByLabel('Nom complet').fill(CONSULTANT_NAME)
    await dialog.getByRole('button', { name: 'Enregistrer' }).click()

    // La fiche est écrite UNE fois, avec le nom saisi.
    await expect.poll(() => writes.filter(w => w.key === 'POST /consultants').length).toBe(1)
    const created = writes.find(w => w.key === 'POST /consultants')?.body as { full_name?: string }
    expect(created.full_name).toBe(CONSULTANT_NAME)

    // Le panneau propose le geste suivant, annonce « Gratuit » (#4463 : aucun crédit n'est nommé côté client).
    const next = page.getByTestId('need-door-next-gesture')
    await expect(next).toContainText(CONSULTANT_NAME)
    await expect(next).toContainText('Ingénieur DevOps Kubernetes')
    await expect(next).toContainText('Gratuit, quelques secondes')

    // Doctrine : enregistrer n'est pas positionner.
    expect(writes.some(w => w.key.startsWith('POST /submissions'))).toBe(false)

    // Le rapprochement mène à la liste des besoins, ouverte sur CE besoin.
    await next.getByRole('button', { name: 'Lancer le rapprochement' }).click()
    await expect(page).toHaveURL(new RegExp(`/projects/needs\\?match=${NEED_ID}`))
    // Toujours aucune proposition envoyée à un client.
    expect(writes.some(w => w.key.startsWith('POST /submissions'))).toBe(false)
  })
})
