import type { Page } from '@playwright/test'
import { fulfillJson, mockSignedInShell } from './golden-journey-fixtures'

/**
 * Socle des parcours dorés « du besoin au positionnement » (#2208.43-.47) :
 * un besoin ouvert, le matching qu'il lance, les profils que ce matching rend.
 * Partagé par cinq fichiers (GA-26 : un seul endroit sait simuler cet écran).
 *
 * Le moteur rend TOUJOURS les treize axes dont certains à `null` : les profils
 * ci-dessous en portent quatre, dont trois évaluables — le minimum sous lequel
 * la carte accepte d'écrire un score (« un score n'est jamais nu »).
 */

export const NEED_ID = '11111111-1111-4111-8111-111111111111'
export const RUN_ID = '44444444-4444-4444-8444-444444444444'
export const SOPHIE_ID = 'a0000000-0000-4000-8000-000000000001'
export const PIERRE_ID = 'a0000000-0000-4000-8000-000000000002'
const ACCOUNT_ID = 'acc00000-0000-4000-8000-000000000001'

function needRow(): Record<string, unknown> {
  return {
    id: NEED_ID,
    title: 'Data Engineer',
    urgency: null,
    skills: [{ term: 'spark', label: 'Spark', required: true, level: null }],
    seniority: null,
    headcount: 1,
    target_tjm_cents: null,
    start_on: '2026-11-15',
    duration_months: 6,
    location: 'Paris',
    remote: null,
    contract_kind: 'regie',
    deadline_at: null,
    status: 'to_match',
    status_reason: null,
    status_changed_at: '2026-09-28T10:00:00.000Z',
    source: null,
    provenance: null,
    owner_id: null,
    shortlist_count: 0,
    staffable: 'unknown',
    staffable_reason: null,
    project_id: '22222222-2222-4222-8222-222222222222',
    project_label: 'Plateforme data EDF',
    project_stage: 'confirmed',
    account_id: ACCOUNT_ID,
    account_name: 'EDF DSI',
    entity_id: null,
    entity_name: null,
  }
}

function matchResult(consultantId: string, bucket: 'recommended' | 'borderline'): Record<string, unknown> {
  return {
    consultantId,
    axes: [
      { axis: 'must_have', score: 90, weight: 25, detail: 'Spark prouvé', evidence: [] },
      { axis: 'availability', score: 100, weight: 12, detail: 'disponible', evidence: [] },
      { axis: 'seniority', score: 70, weight: 10, detail: 'senior', evidence: [] },
      { axis: 'language', score: null, weight: 5, detail: 'aucune langue demandée', evidence: [] },
    ],
    correspondenceScore: bucket === 'recommended' ? 84 : 66,
    pushableScore: bucket === 'recommended' ? 71 : 52,
    bucket,
    exclusions: [],
    skills: [],
    gaps: [],
    adjacency: [],
    questionsToValidate: [],
    flags: [],
  }
}

function matchRun(): Record<string, unknown> {
  return {
    runId: RUN_ID,
    need: {
      needId: NEED_ID,
      role: 'Data Engineer',
      accountName: 'EDF DSI',
      accountSector: 'énergie',
      projectSectors: [],
      skills: [{ term: 'spark', label: 'Spark', required: true, level: null }],
      minYears: null,
      seniorityBand: null,
      environment: [],
      languages: [],
      clearances: [],
      location: 'Paris',
      remote: null,
      startOn: '2026-11-15',
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
    recommended: [matchResult(SOPHIE_ID, 'recommended')],
    borderline: [matchResult(PIERRE_ID, 'borderline')],
    notEvaluable: [],
    excluded: [],
    exclusionCounts: [],
    nextBestMove: null,
    feedbackLearnings: [],
    identities: [
      {
        consultantId: SOPHIE_ID,
        fullName: 'Sophie M.',
        title: 'Data Engineer',
        dailyRateCents: 65000,
        availableFrom: '2026-10-15',
        location: 'Lyon',
      },
      {
        consultantId: PIERRE_ID,
        fullName: 'Pierre L.',
        title: 'Data Engineer',
        dailyRateCents: 70000,
        availableFrom: '2026-11-01',
        location: 'Paris',
      },
    ],
  }
}

/**
 * Le besoin ouvert + son matching. Rend le nombre de matchings RÉELLEMENT
 * lancés : `POST /needs/:id/match` écrit un journal de conformité, donc le
 * compter est la seule preuve qu'un clic l'a déclenché (et qu'un rendu non).
 */
export async function mockNeedWithMatching(
  page: Page,
  options: { userId: string; tag: string },
): Promise<{ matchesRun: () => number }> {
  await mockSignedInShell(page, { userId: options.userId, tag: options.tag, features: ['needs', 'talent_pool'] })
  let runs = 0
  await page.route(/\/projects\/needs\?/, route =>
    fulfillJson(route, {
      data: [needRow()],
      pagination: { totalItems: 1, hasNext: false, currentPage: 1, size: 1 },
      counters: { total: 1, withoutShortlist: 1, deadlinePassed: 0, startingSoon: 0, notStaffable: 0 },
    }),
  )
  await page.route(`**/needs/${NEED_ID}/match`, route => {
    runs += 1
    return fulfillJson(route, matchRun())
  })
  return { matchesRun: () => runs }
}

/** Ouvre la fiche du besoin et lance le matching — le geste commun aux parcours 13 à 16. */
export async function openMatchingDrawer(page: Page): Promise<void> {
  await page.goto(`/projects/needs/${NEED_ID}`)
  await page.getByRole('button', { name: 'Lancer le matching' }).click()
  await page.getByText('Sophie M.', { exact: true }).waitFor({ timeout: 30_000 })
}
