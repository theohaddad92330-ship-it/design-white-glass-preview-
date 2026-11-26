import { LAURA_JOB_LIMITS, lauraJobBriefSchema, type ActionDispatchResult, type ActionIntent } from '@bellum/contracts'
import type { WorkflowRunEntity } from '../../database/entities/workflow-run.entity'
import { LauraJobExecutor } from './laura-job.executor'
import type { LauraJobAnalysisState, LauraJobCapabilityPorts } from './laura-job.port'
import { inMemoryRepository } from './testing/in-memory-repository'

/**
 * #3860.1 / #3860.2 (lot M06) — les étapes d'un job s'ENCHAÎNENT.
 *
 *  - une analyse de compte part pour chaque compte du périmètre (au plus `units`),
 *    puis le job ATTEND : il se gare (`planned`) et se remet en file avec un délai ;
 *  - à la fin des analyses, les contacts trouvés sur ces comptes entrent dans le
 *    périmètre — l'étape « préparer un message » qui suit les vise ;
 *  - une étape qui exige un filtre sans filtre ne part pas (`missing_criteria`) ;
 *  - mémoire marché, matching et photo de territoire passent par le service qui
 *    les possède, et une source muette se dit (jamais un résultat inventé).
 */

const WS = '7a0c2f10-0000-4000-8000-000000000002'
const USER = '9d359267-0000-4000-8000-000000000001'
const A1 = '11111111-1111-4111-8111-111111111111'
const A2 = '11111111-1111-4111-8111-111111111112'
const C1 = '22222222-2222-4222-8222-222222222221'
const C2 = '22222222-2222-4222-8222-222222222222'
const C_HIDDEN = '22222222-2222-4222-8222-222222222223'
const NEED = '55555555-5555-4555-8555-555555555555'
const JOB = 'job-1'
const data = { jobId: JOB, workspaceId: WS, userId: USER, email: 'rep@esn.fr' }

function seed(steps: Record<string, unknown>[], scope: { accountIds?: string[]; contactIds?: string[] } = {}) {
  const runs = inMemoryRepository<WorkflowRunEntity>()
  runs.rows.push({
    id: JOB,
    workspace_id: WS,
    user_id: USER,
    definition_key: 'laura_job',
    trigger: 'laura_job',
    status: 'planned',
    correlation_id: 'job_turn',
    estimated_credits: 10,
    spent_credits: 0,
    started_at: null,
    finished_at: null,
    conversation_id: 'thread-1',
    job: lauraJobBriefSchema.parse({
      originalRequest: 'Analyse ces filiales et prépare un message pour chaque décideur',
      intent: 'Analyser puis écrire',
      expectedOutcome: 'Un brouillon par décideur',
      scope: { description: 'Deux filiales', accountIds: [A1, A2], contactIds: [], ...scope },
      steps,
    }),
  } as unknown as WorkflowRunEntity)
  return runs
}

function harness(runs: ReturnType<typeof seed>, overrides: Partial<LauraJobCapabilityPorts> = {}) {
  const states = new Map<string, LauraJobAnalysisState>()
  const ports: LauraJobCapabilityPorts = {
    startAnalysis: jest.fn(async ({ accountId }) => ({ runRef: `analysis:${accountId}` })),
    analysisState: jest.fn(async ({ accountId }) => states.get(accountId) ?? 'running'),
    searchMarketMemory: jest.fn(async () => ({ count: 7, truncated: false })),
    matchNeed: jest.fn(async () => ({ recommended: 3 })),
    latestTerritorySnapshot: jest.fn(async () => ({ takenOn: '2026-10-05', offers: 42 })),
    ...overrides,
  }
  const enqueued: Array<{ delayMs?: number }> = []
  const enqueuer = {
    enqueue: jest.fn(async (_d: unknown, options?: { delayMs?: number }) => void enqueued.push(options ?? {})),
  }
  const dispatched: ActionIntent[] = []
  const dispatcher = {
    dispatch: jest.fn(async (intent: ActionIntent): Promise<ActionDispatchResult> => {
      dispatched.push(intent)
      return {
        type: intent.type,
        status: 'done',
        artifact: { kind: 'message_draft', channel: 'email', subject: 'Bonjour', body: 'Texte', angle: null },
      }
    }),
  }
  const contacts = inMemoryRepository<Record<string, unknown>>()
  contacts.rows.push(
    { id: C1, workspace_id: WS, account_id: A1, hidden: false, deleted_at: null },
    { id: C2, workspace_id: WS, account_id: A2, hidden: false, deleted_at: null },
    { id: C_HIDDEN, workspace_id: WS, account_id: A1, hidden: true, deleted_at: null },
  )
  const accounts = inMemoryRepository<Record<string, unknown>>()
  const reservations = { reserve: jest.fn(async () => ({})), settle: jest.fn(async () => undefined) }
  const executor = new LauraJobExecutor(
    runs as never,
    accounts as never,
    contacts as never,
    reservations as never,
    dispatcher as never,
    { keep: jest.fn(async () => 'draft-1') } as never,
    undefined,
    undefined,
    ports,
    enqueuer,
  )
  return { executor, ports, states, enqueued, dispatched, row: () => runs.rows[0]! }
}

const analyse = { key: 'analyse', label: 'Analyser les filiales', capability: 'account_analysis', units: 5 }
const write = {
  key: 'write',
  label: 'Préparer un message',
  capability: 'message_generation',
  units: 10,
  dependsOn: ['analyse'],
}

describe('#3860.1 — une analyse de compte part, puis le job ATTEND', () => {
  it('lance une analyse par compte du périmètre, se gare et se remet en file avec un délai', async () => {
    const { executor, ports, enqueued, row } = harness(seed([analyse, write]))
    await executor.run(data)
    expect(ports.startAnalysis).toHaveBeenCalledTimes(2)
    expect(row().status).toBe('planned')
    const step = row().job?.steps[0]
    expect(step?.status).toBe('running')
    expect(step?.awaiting.map(entry => entry.accountId)).toEqual([A1, A2])
    expect(enqueued).toHaveLength(1)
    expect(enqueued[0]?.delayMs).toBeGreaterThan(0)
  })

  it('NON : tant qu’une analyse tourne, le passage suivant se regare sans rien relancer', async () => {
    const { executor, ports, states, enqueued, row } = harness(seed([analyse, write]))
    await executor.run(data)
    states.set(A1, 'done')
    await executor.run(data)
    expect(ports.startAnalysis).toHaveBeenCalledTimes(2)
    expect(row().status).toBe('planned')
    expect(enqueued).toHaveLength(2)
  })
})

describe('#3860.2 — les contacts trouvés par l’analyse alimentent l’étape suivante', () => {
  it('à la fin des analyses : périmètre réécrit, message préparé pour CHAQUE contact trouvé', async () => {
    const { executor, states, dispatched, row } = harness(seed([analyse, write]))
    await executor.run(data)
    states.set(A1, 'done')
    states.set(A2, 'done')
    await executor.run(data)
    const job = row().job!
    // Le contact masqué n'entre pas : jamais une cible que l'écran cache.
    expect(job.scope.contactIds).toEqual([C1, C2])
    expect(job.steps[0]).toMatchObject({ status: 'done', awaiting: [], produced: { contactIds: [C1, C2] } })
    expect(dispatched.map(intent => (intent as { contactId: string }).contactId)).toEqual([C1, C2])
    expect(job.steps[1]?.status).toBe('done')
    expect(row().status).toBe('done')
  })

  it('une analyse échouée ne verse rien ; toutes échouées : l’étape échoue, la suite est sautée', async () => {
    const { executor, states, dispatched, row } = harness(seed([analyse, write]))
    await executor.run(data)
    states.set(A1, 'failed')
    states.set(A2, 'failed')
    await executor.run(data)
    expect(row().job?.steps[0]).toMatchObject({ status: 'failed', note: 'capability_failed' })
    expect(row().job?.steps[1]).toMatchObject({ status: 'dropped', note: 'dependency_not_done' })
    expect(dispatched).toHaveLength(0)
  })

  it('au-delà de l’attente maximale : `unknown`, jamais `failed`, et rien ne repart', async () => {
    const { executor, enqueued, row } = harness(seed([analyse, write]))
    await executor.run(data)
    const job = row().job!
    const old = new Date(Date.now() - (LAURA_JOB_LIMITS.maxAsyncWaitSeconds + 60) * 1000).toISOString()
    row().job = {
      ...job,
      steps: job.steps.map(step => ({ ...step, awaiting: step.awaiting.map(a => ({ ...a, launchedAt: old })) })),
    }
    await executor.run(data)
    expect(row().job?.steps[0]).toMatchObject({ status: 'unknown', note: 'timeout' })
    expect(row().status).toBe('unknown')
    expect(enqueued).toHaveLength(1)
  })

  it('une analyse refusée au lancement le DIT ; aucune lancée : l’étape est bloquée', async () => {
    const { executor, row } = harness(seed([analyse]), {
      startAnalysis: jest.fn(async () => ({ refused: 'Crédits insuffisants.' })),
    })
    await executor.run(data)
    expect(row().job?.steps[0]).toMatchObject({ status: 'blocked', note: 'refused' })
    expect(row().job?.errors.map(error => error.message)).toContain('Crédits insuffisants.')
  })
})

describe('#3860.1 — les capacités à filtre', () => {
  it('sans filtre : rien ne part, `missing_criteria`', async () => {
    const { executor, ports, row } = harness(
      seed([{ key: 'memory', label: 'Mémoire', capability: 'search_market_memory' }]),
    )
    await executor.run(data)
    expect(ports.searchMarketMemory).not.toHaveBeenCalled()
    expect(row().job?.steps[0]).toMatchObject({ status: 'blocked', note: 'missing_criteria' })
  })

  it('mémoire marché filtrée, matching d’un besoin, photo de territoire : chacune par son service', async () => {
    const { executor, ports, row } = harness(
      seed([
        { key: 'memory', label: 'Mémoire', capability: 'search_market_memory', criteria: { technology: 'Java' } },
        { key: 'match', label: 'Matching', capability: 'need_matching', criteria: { needId: NEED } },
        { key: 'snap', label: 'Territoire', capability: 'territory_snapshot', criteria: { department: '31' } },
      ]),
    )
    await executor.run(data)
    expect(ports.searchMarketMemory).toHaveBeenCalledWith({ workspaceId: WS, criteria: { technology: 'Java' } })
    expect(ports.matchNeed).toHaveBeenCalledWith({ workspaceId: WS, userId: USER, needId: NEED })
    expect(ports.latestTerritorySnapshot).toHaveBeenCalledWith('31')
    expect(row().job?.steps.map(step => step.status)).toEqual(['done', 'done', 'done'])
    expect(row().job?.intermediateResults.map(result => result.summary)).toEqual(['7', '3', '2026-10-05 · 42'])
  })

  it('une source muette se DIT : jamais un résultat inventé', async () => {
    const { executor, row } = harness(
      seed([
        { key: 'match', label: 'Matching', capability: 'need_matching', criteria: { needId: NEED } },
        { key: 'snap', label: 'Territoire', capability: 'territory_snapshot', criteria: { department: '31' } },
      ]),
      { matchNeed: jest.fn(async () => null), latestTerritorySnapshot: jest.fn(async () => null) },
    )
    await executor.run(data)
    expect(row().job?.steps[0]).toMatchObject({ status: 'failed', note: 'capability_failed' })
    expect(row().job?.steps[1]).toMatchObject({ status: 'blocked', note: 'no_target_in_scope' })
    expect(row().job?.intermediateResults).toEqual([])
  })

  it('une photo sans mesure d’offres le dit « non mesuré », jamais 0', async () => {
    const { executor, row } = harness(
      seed([{ key: 'snap', label: 'Territoire', capability: 'territory_snapshot', criteria: { department: '31' } }]),
      { latestTerritorySnapshot: jest.fn(async () => ({ takenOn: '2026-10-05', offers: null })) },
    )
    await executor.run(data)
    expect(row().job?.intermediateResults[0]?.summary).toBe('2026-10-05 · —')
  })
})
