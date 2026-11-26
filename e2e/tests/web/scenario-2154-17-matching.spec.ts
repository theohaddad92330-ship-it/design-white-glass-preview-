import { expect, test } from '@playwright/test'
import { json, mockSession } from './x41-socle'

/**
 * #2154.17 — SCÉNARIO « MATCHING DEPUIS UN BESOIN » (lot X41, #2958).
 *
 * Depuis la fiche d'un besoin (`/projects/needs/:id?tab=matching`), l'onglet
 * « Rapprochement » lance le classement (`POST /needs/:id/match`) — un geste,
 * une écriture de journal, JAMAIS un envoi ni une candidature. NO-GO nommé par
 * #2154 : « matching opaque » — un score n'est jamais nu.
 *
 * Ce que le scénario prouve :
 *  1. dès l'ouverture, UN seul `POST /needs/n-1/match` part (pas de relance
 *     en boucle) ;
 *  2. le classement liste les recommandés avec leur nom ; un profil dont trois
 *     axes au moins sont évaluables affiche son score (88 / 76), un profil à
 *     UN seul axe évaluable affiche « non mesuré » — « sous trois axes, il n'y
 *     a pas de score » : le 95 déclaré ne s'affiche jamais nu ;
 *  3. un besoin SANS compétence ne lance RIEN et DIT pourquoi ;
 *  4. un échec du classement est dit, jamais une liste vide muette.
 */

const NEED = {
  id: 'n-1',
  title: 'Ingénieur données',
  urgency: null,
  skills: [{ term: 'Spark', required: true, level: null }],
  seniority: null,
  headcount: 1,
  target_tjm_cents: null,
  start_on: null,
  duration_months: null,
  location: null,
  contract_kind: 'regie',
  deadline_at: null,
  status: 'matching',
  status_reason: null,
  status_changed_at: null,
  source: null,
  provenance: null,
  owner_id: null,
  shortlist_count: 0,
  staffable: 'unknown',
  staffable_reason: null,
  project_id: 'p-1',
  project_label: 'Portail transporteurs',
  project_stage: 'qualified',
  account_id: 'a-1',
  account_name: 'NOVA LOGISTIQUE',
  entity_id: null,
  entity_name: null,
}

const RUN = {
  runId: '44444444-4444-4444-8444-444444444444',
  need: {
    needId: 'n-1',
    role: 'Ingénieur données',
    accountName: 'NOVA LOGISTIQUE',
    accountSector: null,
    projectSectors: [],
    skills: [{ term: 'spark', label: 'Spark', required: true, level: null }],
    minYears: null,
    seniorityBand: null,
    environment: [],
    languages: [],
    clearances: [],
    location: null,
    remote: null,
    startOn: null,
    targetRateCents: null,
    contractKind: 'regie',
  },
  weights: {
    must_have: 25,
    nice_to_have: 8,
    seniority: 10,
    sector: 8,
    environment: 7,
    language: 5,
    location: 8,
    availability: 12,
    contract_status: 4,
    rate: 7,
    evidence_quality: 4,
    client_constraints: 2,
    risks: 5,
  },
  threshold: 60,
  evaluatedCount: 2,
  prefilteredCount: 0,
  truncated: false,
  recommended: [
    {
      consultantId: 'c-1',
      axes: [
        { axis: 'must_have', score: 90, weight: 25, detail: 'Spark prouvé', evidence: [] },
        { axis: 'seniority', score: 80, weight: 10, detail: 'Dix ans d’expérience', evidence: [] },
        { axis: 'availability', score: 70, weight: 12, detail: 'Libre dans un mois', evidence: [] },
      ],
      correspondenceScore: 88,
      pushableScore: 76,
      bucket: 'recommended',
      exclusions: [],
      skills: [],
      gaps: [],
      adjacency: [],
      questionsToValidate: [],
      flags: [],
    },
    {
      consultantId: 'c-2',
      // Un seul axe évaluable : sous trois axes, il n'y a PAS de score.
      axes: [{ axis: 'must_have', score: 95, weight: 25, detail: 'Spark déclaré', evidence: [] }],
      correspondenceScore: 95,
      pushableScore: 90,
      bucket: 'recommended',
      exclusions: [],
      skills: [],
      gaps: [],
      adjacency: [],
      questionsToValidate: [],
      flags: [],
    },
  ],
  borderline: [],
  notEvaluable: [],
  excluded: [],
  exclusionCounts: [],
  identities: [
    { consultantId: 'c-1', fullName: 'Sophie M.', title: 'Data Engineer' },
    { consultantId: 'c-2', fullName: 'Paul D.', title: 'Data Engineer' },
  ],
  nextBestMove: null,
  feedbackLearnings: [],
  createdAt: '2026-08-30T10:00:00.000Z',
}

async function mockBesoin(page: import('@playwright/test').Page, need: unknown) {
  await page.route(/\/projects\/needs\?/, route =>
    json(route, { data: [need], pagination: { total: 1, offset: 0, limit: 1, hasMore: false }, counters: {} }),
  )
}

test.describe('#2154.17 — matching depuis un besoin', () => {
  test('un seul POST /needs/:id/match ; les recommandés portent leurs axes, jamais un score nu', async ({ page }) => {
    await mockSession(page, { features: ['needs', 'accounts', 'talent_pool'], tag: '17' })
    await mockBesoin(page, NEED)
    const runs: string[] = []
    await page.route('**/needs/n-1/match', route => {
      runs.push(route.request().method())
      return json(route, RUN)
    })
    await page.goto('/projects/needs/n-1?tab=matching')

    await expect(page.getByText('Recommandés (2)')).toBeVisible({ timeout: 30_000 })
    const drawer = page.getByRole('dialog')
    await expect(drawer.getByText('Sophie M.', { exact: true })).toBeVisible()
    // Trois axes évaluables : le score se lit (88 / 76).
    await expect(drawer).toContainText('88')
    await expect(drawer).toContainText('76')
    // Un seul axe : « non mesuré » — le 95 déclaré ne s'affiche JAMAIS nu.
    await expect(drawer).toContainText('non mesuré')
    await expect(drawer).not.toContainText('95')
    await expect(drawer).not.toContainText('Poussable 90')
    expect(runs).toEqual(['POST'])
  })

  test('un besoin sans compétence ne lance rien et dit pourquoi', async ({ page }) => {
    await mockSession(page, { features: ['needs', 'accounts', 'talent_pool'], tag: '17' })
    await mockBesoin(page, { ...NEED, skills: [] })
    const runs: string[] = []
    await page.route('**/needs/n-1/match', route => {
      runs.push(route.request().method())
      return json(route, RUN)
    })
    await page.goto('/projects/needs/n-1?tab=matching')

    await expect(
      page.getByText(
        "Ce besoin n'a pas de compétence renseignée. Ajoute-en au moins une, sinon je compare dans le vide.",
      ),
    ).toBeVisible({ timeout: 30_000 })
    expect(runs).toEqual([])
  })

  test('un échec du classement est dit — jamais une liste vide muette', async ({ page }) => {
    await mockSession(page, { features: ['needs', 'accounts', 'talent_pool'], tag: '17' })
    await mockBesoin(page, NEED)
    await page.route('**/needs/n-1/match', route =>
      json(route, { message: 'Le moteur de rapprochement est indisponible' }, 503),
    )
    await page.goto('/projects/needs/n-1?tab=matching')

    await expect(page.getByText('Le moteur de rapprochement est indisponible').first()).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Recommandés (', { exact: false })).toHaveCount(0)
  })
})
