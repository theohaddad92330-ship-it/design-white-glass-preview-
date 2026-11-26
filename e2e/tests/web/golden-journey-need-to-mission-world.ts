import type { Page, Route } from '@playwright/test'
import { fulfillJson, mockSignedInShell } from './golden-journey-fixtures'

/**
 * #2446.17 (golden journey 4, lot M12 09/10) — UN SEUL MONDE pour « du besoin à
 * la mission démarrée ».
 *
 * Les huit étapes existaient en specs isolés, chacun sur SON jeu de données :
 * `golden-journey-need-to-consultant.spec.ts` (besoin 22222222…),
 * `golden-journey-matching-fixtures.ts` (besoin 11111111…, run 44444444…) et
 * `golden-journey-dossier-fixtures.ts` (affaire 55555555…, positionnement
 * 66666666…). Aucun lien entre eux : le consultant positionné chez ACME n'était
 * pas celui que le matching d'EDF avait classé. Ce module les UNIFIE — un
 * besoin, SON affaire, SON compte, le consultant créé depuis la fiche, le
 * matching qui le classe, le positionnement qui le rattache à l'affaire.
 *
 * Le monde est À ÉTAT : chaque écriture (`POST /consultants`, positionnement,
 * entretien, accords, étape) change ce que les lectures suivantes rendent,
 * comme le ferait le serveur. Toute écriture est journalisée par « MÉTHODE
 * chemin » : le spec prouve ce qui part, et ce qui ne part PAS.
 */

const API_ORIGIN = 'http://127.0.0.1:4599'

export const GJ4 = {
  userId: '4b7a4b1e-4444-4a11-9c33-244617000001',
  needId: '24461700-0000-4000-8000-000000000001',
  projectId: '24461700-0000-4000-8000-000000000002',
  accountId: '24461700-0000-4000-8000-000000000003',
  consultantId: '24461700-0000-4000-8000-000000000004',
  runId: '24461700-0000-4000-8000-000000000005',
  submissionId: '24461700-0000-4000-8000-000000000006',
  needTitle: 'Data Engineer',
  projectLabel: 'Plateforme data EDF',
  accountName: 'EDF DSI',
  consultantName: 'Inès Marchand',
} as const

type Write = { key: string; body: unknown }

type World = {
  projectStage: string
  consultantCreated: boolean
  submissionStage: 'submitted' | null
  interviewCount: number
  consultantAgreement: boolean | null
  writes: Write[]
  /** Écritures tombées dans le filet (préférences, contexte de Laura…) : hors parcours. */
  strayWrites: string[]
}

function needRow(world: World): Record<string, unknown> {
  return {
    id: GJ4.needId,
    title: GJ4.needTitle,
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
    status: world.submissionStage ? 'submitted' : 'to_match',
    status_reason: null,
    status_changed_at: '2026-09-28T10:00:00.000Z',
    source: null,
    provenance: null,
    owner_id: null,
    shortlist_count: world.submissionStage ? 1 : 0,
    staffable: 'unknown',
    staffable_reason: null,
    project_id: GJ4.projectId,
    project_label: GJ4.projectLabel,
    project_stage: world.projectStage,
    account_id: GJ4.accountId,
    account_name: GJ4.accountName,
    entity_id: null,
    entity_name: null,
  }
}

function matchRun(): Record<string, unknown> {
  return {
    runId: GJ4.runId,
    need: {
      needId: GJ4.needId,
      role: GJ4.needTitle,
      accountName: GJ4.accountName,
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
    evaluatedCount: 1,
    prefilteredCount: 0,
    truncated: false,
    recommended: [
      {
        consultantId: GJ4.consultantId,
        // Les treize axes en vrai, dont certains `null` : la carte exige trois
        // axes évaluables pour écrire un score (« un score n'est jamais nu »).
        axes: [
          { axis: 'must_have', score: 90, weight: 25, detail: 'Spark prouvé', evidence: [] },
          { axis: 'availability', score: 100, weight: 12, detail: 'disponible', evidence: [] },
          { axis: 'seniority', score: 70, weight: 10, detail: 'senior', evidence: [] },
          { axis: 'language', score: null, weight: 5, detail: 'aucune langue demandée', evidence: [] },
        ],
        correspondenceScore: 84,
        pushableScore: 71,
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
    nextBestMove: null,
    feedbackLearnings: [],
    identities: [
      {
        consultantId: GJ4.consultantId,
        fullName: GJ4.consultantName,
        title: 'Data Engineer',
        dailyRateCents: 65000,
        availableFrom: '2026-10-15',
        location: 'Paris',
      },
    ],
  }
}

function project(world: World): Record<string, unknown> {
  return {
    id: GJ4.projectId,
    account_id: GJ4.accountId,
    company_name: GJ4.accountName,
    sector: null,
    logo_url: null,
    website: null,
    kind: 'pain',
    label: GJ4.projectLabel,
    detail: null,
    offer: null,
    source: null,
    confidence: null,
    urgency: null,
    stage: world.projectStage,
    stage_entered_at: '2026-09-20T10:00:00.000Z',
    owner_id: null,
    expected_close_on: null,
    closed_at: null,
    outcome: null,
    loss_reason: null,
    first_detected_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-09-28T00:00:00.000Z',
    amount_cents: null,
    interview_count: world.interviewCount,
  }
}

function submission(world: World): Record<string, unknown> {
  return {
    id: GJ4.submissionId,
    projectId: GJ4.projectId,
    projectLabel: GJ4.projectLabel,
    accountId: GJ4.accountId,
    accountName: GJ4.accountName,
    needId: GJ4.needId,
    needRole: GJ4.needTitle,
    consultantId: GJ4.consultantId,
    consultantName: GJ4.consultantName,
    stage: world.submissionStage,
    substatus: null,
    stageEnteredAt: '2026-10-09T09:00:00.000Z',
    submittedAt: '2026-10-09T09:00:00.000Z',
    firstFeedbackAt: null,
    closedAt: null,
    outcomeReason: null,
    outcomeDetail: null,
    proposedRateCents: 65000,
    cvSnapshot: null,
    ownerId: null,
    ownerName: null,
    recipientContactId: null,
    recipientContactName: null,
    channel: null,
    message: null,
    availability: null,
    conditions: null,
    consultantAgreement: world.consultantAgreement,
    consultantAgreementDate: world.consultantAgreement ? '2026-10-01' : null,
    nextActionLabel: null,
    nextActionDueAt: null,
    nextActionOwnerId: null,
    nextActionOwnerName: null,
    createdAt: '2026-10-09T09:00:00.000Z',
    updatedAt: '2026-10-09T09:00:00.000Z',
  }
}

/**
 * Monte le monde GJ4 sur `page` et rend son état (lecture seule pour le spec :
 * `writes` est le journal des écritures, `projectStage` l'étape courante).
 */
export async function mockNeedToMissionWorld(page: Page): Promise<Readonly<World>> {
  const world: World = {
    projectStage: 'confirmed',
    consultantCreated: false,
    submissionStage: null,
    interviewCount: 0,
    consultantAgreement: null,
    writes: [],
    strayWrites: [],
  }

  // Le filet, enregistré EN PREMIER (Playwright donne la priorité à la dernière
  // route posée) : une écriture qui y tombe est mise à part.
  await page.route(`${API_ORIGIN}/**`, (route: Route) => {
    const request = route.request()
    if (request.method() !== 'GET') world.strayWrites.push(`${request.method()} ${new URL(request.url()).pathname}`)
    return fulfillJson(route, { items: [], total: 0 })
  })

  await mockSignedInShell(page, { userId: GJ4.userId, tag: '244617', features: ['needs', 'talent_pool', 'pipe'] })

  const log = (route: Route) => {
    const request = route.request()
    world.writes.push({ key: `${request.method()} ${new URL(request.url()).pathname}`, body: request.postDataJSON() })
  }

  // Lectures annexes de la fiche besoin qui attendent un TABLEAU ou un objet
  // précis (même forme que `golden-journey-need-to-consultant.spec.ts`).
  await page.route(/reverse-prospects/, route =>
    fulfillJson(route, { needId: GJ4.needId, location: null, skillTerms: [], unavailableReason: null, matches: [] }),
  )
  await page.route(/partner-briefs/, route => fulfillJson(route, []))
  await page.route(/workspaces\/members/, route => fulfillJson(route, []))
  // La liste des besoins lit aussi la propagation (CA, marge) et l'hygiène.
  await page.route(/\/delivery\/propagation$/, route =>
    fulfillJson(route, { accounts: [], contacts: [], consultants: [] }),
  )
  await page.route(/\/delivery\/finance\/propagation$/, route =>
    fulfillJson(route, { accounts: [], consultants: [], canReadFinance: false }),
  )
  await page.route(/\/pilotage\/hygiene$/, route => fulfillJson(route, { lines: [] }))

  await page.route(/\/projects\/needs\?/, route => {
    // #4344 — la liste s'ouvre par un lien profond (`?q=`) : la NAVIGATION vers la page passe telle quelle.
    if (route.request().resourceType() === 'document') return route.fallback()
    return fulfillJson(route, {
      data: [needRow(world)],
      pagination: { totalItems: 1, hasNext: false, currentPage: 1, size: 1 },
      counters: {
        total: 1,
        withoutShortlist: world.submissionStage ? 0 : 1,
        deadlinePassed: 0,
        startingSoon: 0,
        notStaffable: 0,
      },
    })
  })
  await page.route(`${API_ORIGIN}/consultants`, route => {
    if (route.request().method() !== 'POST') return fulfillJson(route, { items: [], total: 0 })
    log(route)
    world.consultantCreated = true
    return fulfillJson(route, { id: GJ4.consultantId, full_name: GJ4.consultantName })
  })
  await page.route(`**/needs/${GJ4.needId}/match`, route => {
    log(route)
    return fulfillJson(route, matchRun())
  })
  await page.route(`**/needs/${GJ4.needId}/submissions/preview`, route =>
    fulfillJson(route, {
      creates: [`Un positionnement de ${GJ4.consultantName} sur « ${GJ4.needTitle} »`],
      canPrepare: [{ action: 'cv', label: 'Préparer le CV ciblé', defaultChecked: true }],
      checks: [{ label: 'Disponibilité confirmée', level: 'ok' }],
      missing: [],
      blocked: false,
    }),
  )
  await page.route(`**/needs/${GJ4.needId}/submissions`, route => {
    if (route.request().method() !== 'POST') return fulfillJson(route, { items: [] })
    log(route)
    // Le serveur rattache le positionnement à l'affaire du besoin et la fait
    // avancer à « profils proposés » — c'est ce que la suite du parcours relit.
    world.submissionStage = 'submitted'
    world.projectStage = 'profiles_submitted'
    return fulfillJson(route, { id: GJ4.submissionId })
  })
  await page.route(/\/projects\?id=/, route => fulfillJson(route, [project(world)]))
  // Le dossier d'affaire lit ses besoins, contacts et documents en TABLEAUX.
  await page.route(new RegExp(`/projects/${GJ4.projectId}/(needs|contacts|documents)$`), route =>
    fulfillJson(route, []),
  )
  await page.route(new RegExp(`/contacts/account/${GJ4.accountId}$`), route => fulfillJson(route, []))
  await page.route(/\/chains\/subject\//, route => fulfillJson(route, { chains: [] }))
  // La frise d'activité échoue comme sur le port mort (les jeux d'origine) : elle
  // a son propre état d'erreur, et le parcours ne la lit pas.
  await page.route(/\/activities\?/, route => route.abort('connectionrefused'))
  await page.route(/\/submissions\?/, route =>
    fulfillJson(route, {
      items: world.submissionStage ? [submission(world)] : [],
      funnel: {
        submitted: world.submissionStage ? 1 : 0,
        acceptanceRate: null,
        medianDaysToFeedback: null,
        noFeedback: world.submissionStage ? 1 : 0,
      },
    }),
  )
  await page.route(`**/submissions/${GJ4.submissionId}/interviews`, route => {
    if (route.request().method() !== 'POST') return fulfillJson(route, { items: [] })
    log(route)
    world.interviewCount += 1
    return fulfillJson(route, { id: 'gj4-interview-1' })
  })
  await page.route(`**/submissions/${GJ4.submissionId}/details`, route => {
    log(route)
    const body = route.request().postDataJSON() as { consultantAgreement?: boolean }
    if (typeof body.consultantAgreement === 'boolean') world.consultantAgreement = body.consultantAgreement
    return fulfillJson(route, { id: GJ4.submissionId })
  })
  await page.route(`**/projects/${GJ4.projectId}/stage`, route => {
    log(route)
    const body = route.request().postDataJSON() as { stage: string }
    world.projectStage = body.stage
    return fulfillJson(route, { project: { id: GJ4.projectId, stage: body.stage }, effects: [] })
  })

  return world
}
