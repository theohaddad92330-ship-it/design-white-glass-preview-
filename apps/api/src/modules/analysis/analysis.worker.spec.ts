import { Logger } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import { DelayedError, type Job, type Queue } from 'bullmq'
import {
  ANALYSIS_WORKER_OPTIONS,
  MAX_INFRA_REQUEUES,
  MAX_PHASE_TIMEOUT_MS,
  AnalysisStreamInterruptedError,
  AnalysisWorker,
  AnalysisWorkerRestartedError,
  classifyAnalysisFailureOutcome,
  stripNullBytes,
  userFacingFailureReason,
} from './analysis.worker'
import type { AnalysisCheckpointReader } from './analysis-checkpoint.reader'
import type { AnalysisEventEmitter } from './analysis-event-emitter.service'
import { AnalysisCancellationService } from './analysis-cancellation.service'
import type { AnalysisRunsService } from './analysis-runs.service'
import type { AnalysisGateway } from './analysis.gateway'
import type { AnalysisPersistenceService } from './analysis.persistence'
import type { AccountsService } from '../accounts/accounts.service'
import type { CreditsService } from '../credits/credits.service'
import type { CorrelationIdService } from '../../correlation-id/correlation-id.service'
import { IaClient } from '../ia/ia.client'
import type { IntegrationsService } from '../integrations/integrations.service'
import type { NotificationsService } from '../notifications/notifications.service'
import type { SellerHypothesesForRun } from './seller-hypotheses.reader'
import { ANALYSIS_WORKER_NAME, WorkerReadinessRegistry } from '../worker-readiness/worker-readiness.registry'
import type { AnalysisAccountFact, AnalysisKnownContact } from './analysis-facts-inputs'
import type { AnalysisEntityQuestion } from '@bellum/contracts'

interface AnalysisJobData {
  accountId: string
  userId: string
  companyName: string
  profileData: Record<string, unknown>
  userContext?: string
  correlationId?: string
  slotConsumed?: boolean
  // Axe CHEMIN (#1631.3/.4, lot 14) — voir `analysis.worker.ts`.
  marketPathsObserved?: number
  marketTopEsn?: string
  // #2519 — remises en file après une coupure d'infrastructure.
  infraRequeues?: number
  // #3219 (#190.2, lot P02 07/10) — périmètre d'analyse DÉCLARÉ, voir `analysis.worker.ts`.
  // #3742 — la puce de périmètre (« France »…) choisie au lancement.
  scopeMode?: string
  // #3288 — cadrage confirmé (profondeur incluse).
  scopeSelection?: Record<string, unknown>
  // #3753.3 — le ciblage de l'ESN (hypothèses du vendeur) — voir `analysis.worker.ts`.
  sellerHypotheses?: SellerHypothesesForRun
  // #4070 — les faits du compte et ce qui en découle — voir `analysis.worker.ts`.
  accountFacts?: AnalysisAccountFact[]
  knownContacts?: AnalysisKnownContact[]
  previousAnalysis?: string
  lostDealRex?: string
  // LUDB.5 — site connu du compte, voir `analysis.worker.ts`.
  website?: string
  // #2164.17 — scope lock, et la pause d'identité (question / réponse).
  siren?: string
  entityQuestion?: AnalysisEntityQuestion
  entityAnswer?: { siren: string; answeredAt: string }
}

type AnalysisJob = Job<AnalysisJobData>

type GatewayMock = {
  emitPhaseStarted: jest.Mock
  emitPhaseProgress: jest.Mock
  emitPhaseComplete: jest.Mock
  emitAnalysisDone: jest.Mock
  emitAnalysisError: jest.Mock
  emitAnalysisRetry: jest.Mock
  emitAnalysisDegraded: jest.Mock
  emitHeartbeat: jest.Mock
}

type DlqMock = { add: jest.Mock<Promise<unknown>, [string, Record<string, unknown>]> }

type IaMock = { analyzeGraph: jest.Mock }

type PersistenceMock = {
  saveResearch: jest.Mock
  saveContacts: jest.Mock
  saveContactsOutOfScope: jest.Mock
  excludeContactsOutsideGeo: jest.Mock
  excludeHomonymContacts: jest.Mock
  geoExcludedContactNames: jest.Mock
  saveEnriched: jest.Mock
  saveOrgChart: jest.Mock
  saveJudge: jest.Mock
  savePlan: jest.Mock
  seedPappersContacts: jest.Mock
  seedJobRecruiterContacts: jest.Mock
  loadResearch: jest.Mock
  loadContactsForResume: jest.Mock
  recordAnalysisCompleted: jest.Mock
  hasPersistedPlan: jest.Mock
}

type AccountsServiceMock = {
  markErrored: jest.Mock
  setApiCost: jest.Mock
  markCompleted: jest.Mock
  applyPhaseTelemetry: jest.Mock
  applyRunCostBreakdown: jest.Mock
}

type RunsMock = {
  recordStart: jest.Mock
  completeLatest: jest.Mock
  stampSourceHealth: jest.Mock
  stampVerdictSnapshot: jest.Mock
  listForAccount: jest.Mock
  // Frontière du run courant : le worker en borne sa lecture des points de
  // contrôle, faute de quoi une relance hérite de ceux du run précédent (le
  // `jobId` est déterministe) et saute ses trois premières phases.
  latestStartedAt: jest.Mock
}

/** Début du run courant — la borne que le worker applique à sa lecture des
 *  points de contrôle. */
const RUN_STARTED_AT = new Date('2026-08-16T08:00:00.000Z')

function makeJob(
  id: string,
  overrides: Partial<AnalysisJobData> = {},
  jobOverrides: Partial<Pick<AnalysisJob, 'attemptsStarted' | 'attemptsMade' | 'opts'>> = {},
): AnalysisJob {
  const data: AnalysisJobData = {
    accountId: 'acc-1',
    userId: 'user-1',
    companyName: 'SNCF',
    profileData: {},
    userContext: '',
    correlationId: 'cid-1',
    ...overrides,
  }
  return {
    id,
    data,
    attemptsStarted: jobOverrides.attemptsStarted ?? 1,
    attemptsMade: jobOverrides.attemptsMade ?? 0,
    opts: jobOverrides.opts ?? { attempts: 3 },
    // #2519 / #2520 — la remise en file après une coupure d'infrastructure.
    updateData: jest.fn().mockResolvedValue(undefined),
    moveToDelayed: jest.fn().mockResolvedValue(undefined),
  } as unknown as AnalysisJob
}

/** Les deux gestes de remise en file d'un job, tels que le spec les observe. */
function requeueMocks(job: AnalysisJob): { updateData: jest.Mock; moveToDelayed: jest.Mock } {
  return job as unknown as { updateData: jest.Mock; moveToDelayed: jest.Mock }
}

// --- GraphEvent stream helpers (the IA contract the worker consumes) ---

type GraphEventLite = { type: string; phase?: string | null; progress: number; data: Record<string, unknown> }

function phaseCompleted(phase: string, output: Record<string, unknown>, costUsd = 0): GraphEventLite {
  return {
    type: 'phase_completed',
    phase,
    progress: 0,
    data: {
      telemetry: {
        cost_usd: costUsd,
        input_tokens: 1000,
        output_tokens: 500,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
        duration_ms: 5000,
      },
      output,
    },
  }
}

// The always-on anti-hallucination Judge (apps/ia/app/graph/judge.py) emits a
// judge_completed after the plan phase, carrying the advisory verdict under
// data.judge. It is NOT a phase (no data.output). Kept in the happy-path stream
// so every parity test exercises the real IA event ordering.
function judgeCompleted(
  verdict: Record<string, unknown> = { passed: true, verdict: 'pass', issues: [], confidence: 1 },
): GraphEventLite {
  return { type: 'judge_completed', phase: 'judge', progress: 100, data: { judge: verdict } }
}

async function* streamOf(events: GraphEventLite[]): AsyncGenerator<GraphEventLite> {
  for (const e of events) yield e
}

function happyStream(over: Record<string, unknown> = {}): AsyncGenerator<GraphEventLite> {
  return streamOf([
    phaseCompleted(
      'research',
      { research: over.research ?? { sector: 'Transport' }, seed_contacts: [], gate: { decision: 'go' } },
      (over.researchCost as number) ?? 0,
    ),
    phaseCompleted(
      'contacts',
      { contacts: over.contacts ?? [{ fullName: 'Jean' }] },
      (over.contactsCost as number) ?? 0,
    ),
    phaseCompleted(
      'classify',
      { classified_contacts: over.classified ?? [{ fullName: 'Jean', role: 'sponsor' }] },
      (over.classifyCost as number) ?? 0,
    ),
    phaseCompleted('plan', { plan: over.plan ?? { actionPlan: {} } }, (over.planCost as number) ?? 0),
    judgeCompleted((over.judge as Record<string, unknown>) ?? undefined),
    { type: 'run_completed', progress: 100, data: { summary: {} } },
  ])
}

describe('ANALYSIS_WORKER_OPTIONS — stall safety', () => {
  it('locks longer than the longest phase so a slow phase is never falsely stalled', () => {
    expect(ANALYSIS_WORKER_OPTIONS.lockDuration).toBeGreaterThan(MAX_PHASE_TIMEOUT_MS)
  })

  it('keeps a finite stall check + a single recovery so a truly dead job is reclaimed', () => {
    expect(ANALYSIS_WORKER_OPTIONS.stalledInterval).toBeGreaterThan(0)
    expect(ANALYSIS_WORKER_OPTIONS.maxStalledCount).toBeGreaterThanOrEqual(1)
  })
})

describe('stripNullBytes', () => {
  it('removes NUL bytes from nested strings so Postgres jsonb accepts the payload', () => {
    const nul = String.fromCharCode(0)
    const dirty = { sector: `Sant${nul}é`, angles: [{ title: `Cloud${nul}` }], score: 8, ok: true }
    const clean = stripNullBytes(dirty)
    expect(clean).toEqual({ sector: 'Santé', angles: [{ title: 'Cloud' }], score: 8, ok: true })
  })

  it('passes through values without NUL untouched', () => {
    expect(stripNullBytes({ a: 'plain', n: 1, list: ['x'] })).toEqual({ a: 'plain', n: 1, list: ['x'] })
  })
})

describe('AnalysisWorker', () => {
  let worker: AnalysisWorker
  let gateway: GatewayMock
  let dlq: DlqMock
  let ia: IaMock
  let accountsService: AccountsServiceMock
  let persistence: PersistenceMock
  let cancellation: AnalysisCancellationService
  let credits: jest.Mocked<Pick<CreditsService, 'refundAnalysisSlot'>>
  let runs: RunsMock
  let readinessRegistry: WorkerReadinessRegistry
  // Promoted to describe scope so a resume test can vary which phases a prior
  // attempt already checkpointed (the worker derives ``resume`` from this).
  let checkpoints: { loadCompletedPhases: jest.Mock }
  // Promu au scope du describe : un run qui n'a rien produit ne doit JAMAIS
  // déclencher la notification « ✅ Dossier prêt ».
  let integrations: { notifyUser: jest.Mock }

  beforeEach(() => {
    accountsService = {
      markErrored: jest.fn().mockResolvedValue(undefined),
      setApiCost: jest.fn().mockResolvedValue(undefined),
      markCompleted: jest.fn().mockResolvedValue(undefined),
      applyPhaseTelemetry: jest.fn().mockResolvedValue(undefined),
      applyRunCostBreakdown: jest.fn().mockResolvedValue(undefined),
    }
    gateway = {
      emitPhaseStarted: jest.fn(),
      emitPhaseProgress: jest.fn(),
      emitPhaseComplete: jest.fn(),
      emitAnalysisDone: jest.fn(),
      emitAnalysisError: jest.fn(),
      emitAnalysisRetry: jest.fn(),
      emitAnalysisDegraded: jest.fn(),
      emitHeartbeat: jest.fn(),
    }
    dlq = { add: jest.fn().mockResolvedValue(undefined) }
    ia = { analyzeGraph: jest.fn() }
    persistence = {
      saveResearch: jest.fn().mockResolvedValue(undefined),
      saveContacts: jest.fn().mockResolvedValue(undefined),
      saveContactsOutOfScope: jest.fn().mockResolvedValue(undefined),
      excludeContactsOutsideGeo: jest.fn().mockResolvedValue(0),
      excludeHomonymContacts: jest.fn().mockResolvedValue(0),
      geoExcludedContactNames: jest.fn().mockResolvedValue([]),
      saveEnriched: jest.fn().mockResolvedValue(undefined),
      saveOrgChart: jest.fn().mockResolvedValue(undefined),
      saveJudge: jest.fn().mockResolvedValue(undefined),
      savePlan: jest.fn().mockResolvedValue(undefined),
      seedPappersContacts: jest.fn().mockResolvedValue(undefined),
      seedJobRecruiterContacts: jest.fn().mockResolvedValue(undefined),
      loadResearch: jest.fn().mockResolvedValue(undefined),
      loadContactsForResume: jest.fn().mockResolvedValue({ seeds: [], classified: [] }),
      recordAnalysisCompleted: jest.fn().mockResolvedValue(undefined),
      // Par défaut le plan EST en base : c'est l'état d'un run normal, où la
      // phase 4 vient de s'exécuter et d'écrire.
      hasPersistedPlan: jest.fn().mockResolvedValue(true),
    }
    const mockCorrelationIdService = {
      runWithContext: async <T>(_ctx: unknown, fn: () => Promise<T>): Promise<T> => fn(),
    } as unknown as CorrelationIdService
    const config = { get: jest.fn().mockReturnValue('http://localhost:3000') } as unknown as ConfigService
    cancellation = new AnalysisCancellationService()
    const events = {
      started: jest.fn().mockResolvedValue(undefined),
      phaseCompleted: jest.fn().mockResolvedValue(undefined),
      completed: jest.fn().mockResolvedValue(undefined),
      failed: jest.fn().mockResolvedValue(undefined),
    } as unknown as AnalysisEventEmitter
    checkpoints = {
      loadCompletedPhases: jest.fn().mockResolvedValue(new Set<string>()),
    }
    const notifications = {
      notifyBuySignalForAccount: jest.fn().mockResolvedValue(undefined),
    } as unknown as NotificationsService
    integrations = { notifyUser: jest.fn().mockResolvedValue(undefined) }
    credits = { refundAnalysisSlot: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<
      Pick<CreditsService, 'refundAnalysisSlot'>
    >
    runs = {
      recordStart: jest.fn().mockResolvedValue(undefined),
      completeLatest: jest.fn().mockResolvedValue(undefined),
      stampSourceHealth: jest.fn().mockResolvedValue(undefined),
      stampVerdictSnapshot: jest.fn().mockResolvedValue(undefined),
      listForAccount: jest.fn().mockResolvedValue([]),
      latestStartedAt: jest.fn().mockResolvedValue(RUN_STARTED_AT),
    }
    readinessRegistry = new WorkerReadinessRegistry()
    worker = new AnalysisWorker(
      gateway as unknown as AnalysisGateway,
      accountsService as unknown as AccountsService,
      mockCorrelationIdService,
      ia as unknown as IaClient,
      dlq as unknown as Queue,
      persistence as unknown as AnalysisPersistenceService,
      config,
      cancellation,
      events,
      checkpoints as unknown as AnalysisCheckpointReader,
      notifications,
      integrations as unknown as IntegrationsService,
      credits as unknown as CreditsService,
      runs as unknown as AnalysisRunsService,
      undefined,
      // Coûts fournisseurs (D19) — hors périmètre de cette suite.
      undefined,
      readinessRegistry,
    )
  })

  describe('process() — single graph orchestrator', () => {
    it('runs the analysis through the graph once and emits completion', async () => {
      ia.analyzeGraph.mockReturnValueOnce(happyStream())

      await worker.process(makeJob('job-1'))

      expect(ia.analyzeGraph).toHaveBeenCalledTimes(1)
      expect(gateway.emitPhaseComplete).toHaveBeenCalledWith('acc-1', 'job-1', 'research_complete', 40, {
        sector: 'Transport',
      })
      expect(gateway.emitAnalysisDone).toHaveBeenCalledWith('acc-1', 'job-1')
    })

    // #1631.3/.4, #1606.2 (lot 14) — l'axe CHEMIN : le worker se contente de
    // FORWARDER ce que `AnalysisService` a déjà résolu dans le job (son propre
    // contexte, comme `crmPresence`) — il ne recalcule rien lui-même.
    it("transmet l'axe chemin (compte de parcours + ESN dominante) à l'IA quand le job les porte", async () => {
      ia.analyzeGraph.mockReturnValueOnce(happyStream())

      await worker.process(makeJob('job-1', { marketPathsObserved: 9, marketTopEsn: 'ALTEN' }))

      const input = ia.analyzeGraph.mock.calls[0]![0] as { marketPathsObserved?: number; marketTopEsn?: string }
      expect(input.marketPathsObserved).toBe(9)
      expect(input.marketTopEsn).toBe('ALTEN')
    })

    it("omet l'axe chemin quand le job ne le porte pas (mémoire marché non résolue) — run inchangé", async () => {
      ia.analyzeGraph.mockReturnValueOnce(happyStream())

      await worker.process(makeJob('job-1'))

      const input = ia.analyzeGraph.mock.calls[0]![0] as { marketPathsObserved?: number; marketTopEsn?: string }
      expect(input.marketPathsObserved).toBeUndefined()
      expect(input.marketTopEsn).toBeUndefined()
    })

    // #3753.3 — le ciblage de l'ESN (hypothèses du vendeur) : le worker le FORWARDE
    // tel que `AnalysisService` l'a résolu, et n'invente rien quand le job n'en porte pas.
    it('#3753.3 — transmet les hypothèses du vendeur à l’IA quand le job les porte', async () => {
      ia.analyzeGraph.mockReturnValueOnce(happyStream())
      const sellerHypotheses: SellerHypothesesForRun = {
        tier_label: 'A',
        selection_reason: 'Plan de transformation SI',
        addressable_issues: 'Dette applicative',
        upcoming_it_projects: null,
      }

      await worker.process(makeJob('job-1', { sellerHypotheses }))

      const input = ia.analyzeGraph.mock.calls[0]![0] as { sellerHypotheses?: unknown }
      expect(input.sellerHypotheses).toEqual(sellerHypotheses)
    })

    // #4070 — les faits du compte, les interlocuteurs connus, l'analyse précédente et les motifs
    // de perte : le worker les FORWARDE tels que `AnalysisService` les a résolus, sans rien recalculer.
    it('#4070 — transmet les faits du compte et ce qui en découle à l’IA', async () => {
      ia.analyzeGraph.mockReturnValueOnce(happyStream())
      const job: Partial<AnalysisJobData> = {
        accountFacts: [{ kind: 'need', label: 'Migration paie cloud', date: '2025-08-12', ageDays: 426 }],
        knownContacts: [{ name: 'Claire Martin', role: 'DSI', relation: 'crm', lastSeen: null }],
        previousAnalysis: 'Analyse du 2026-06-18 (il y a 4 mois)\n- Secteur : Banque',
        lostDealRex: 'Perte du 2024-06-01 — motif déclaré : prix.',
      }

      await worker.process(makeJob('job-1', job))

      const input = ia.analyzeGraph.mock.calls[0]![0] as Record<string, unknown>
      expect(input.accountFacts).toEqual(job.accountFacts)
      expect(input.knownContacts).toEqual(job.knownContacts)
      expect(input.previousAnalysis).toBe(job.previousAnalysis)
      expect(input.lostDealRex).toBe(job.lostDealRex)
    })

    it('#4070 — NON : sans rien dans le job, rien n’est transmis', async () => {
      ia.analyzeGraph.mockReturnValueOnce(happyStream())

      await worker.process(makeJob('job-1'))

      const input = ia.analyzeGraph.mock.calls[0]![0] as Record<string, unknown>
      for (const key of ['accountFacts', 'knownContacts', 'previousAnalysis', 'lostDealRex']) {
        expect(input[key]).toBeUndefined()
      }
    })

    it('#3753.3 — sans ciblage dans le job, rien n’est transmis', async () => {
      ia.analyzeGraph.mockReturnValueOnce(happyStream())

      await worker.process(makeJob('job-1'))

      const input = ia.analyzeGraph.mock.calls[0]![0] as { sellerHypotheses?: unknown }
      expect(input.sellerHypotheses).toBeUndefined()
    })

    // #3288 — le palier choisi voyage jusqu'à l'IA (c'est elle qui règle les
    // pages lues) ; sans palier, le corps du graphe est byte-identique à avant.
    // Cadrage analyse (15/10) — le contrat a changé : chaque paramètre du cadrage part au graphe
    // (`graphScopeSelection`), les exclusions comprises. Ces trois tests le suivent.
    it('#3288 — transmet la profondeur choisie à l’IA, avec les exclusions du cadrage', async () => {
      ia.analyzeGraph.mockReturnValueOnce(happyStream())

      await worker.process(makeJob('job-1', { scopeSelection: { depth: 'deep', excluded_entities: ['Hors France'] } }))

      const input = ia.analyzeGraph.mock.calls[0]![0] as { scopeSelection?: unknown }
      expect(input.scopeSelection).toEqual({ depth: 'deep', excluded_entities: ['Hors France'] })
    })

    // #3742 — le périmètre géographique (puce « France » comprise) part aussi au
    // graphe : l'assembleur d'organigramme filtre le chemin recommandé avec lui.
    it('#3742 — transmet la zone géographique au graphe, puce « France » comprise', async () => {
      ia.analyzeGraph.mockReturnValueOnce(happyStream())

      await worker.process(
        makeJob('job-1', { scopeMode: 'france', scopeSelection: { depth: 'quick', excluded_entities: ['X'] } }),
      )

      const input = ia.analyzeGraph.mock.calls[0]![0] as { scopeSelection?: unknown }
      expect(input.scopeSelection).toEqual({ depth: 'quick', geo_perimeter: 'france', excluded_entities: ['X'] })
    })

    it('#3288 — sans aucun paramètre de cadrage, rien n’est ajouté au graphe', async () => {
      ia.analyzeGraph.mockReturnValueOnce(happyStream())

      await worker.process(makeJob('job-1', { scopeSelection: {} }))

      const input = ia.analyzeGraph.mock.calls[0]![0] as { scopeSelection?: unknown }
      expect(input.scopeSelection).toBeUndefined()
    })

    it('closes the run history (Théo P0) with status=completed and the accumulated cost', async () => {
      ia.analyzeGraph.mockReturnValueOnce(
        happyStream({ researchCost: 0.34, contactsCost: 0.05, classifyCost: 0.08, planCost: 0.34 }),
      )

      await worker.process(makeJob('job-hist'))

      expect(runs.completeLatest).toHaveBeenCalledWith(
        'acc-1',
        expect.objectContaining({ status: 'completed', costUsd: expect.closeTo(0.81, 5) }),
      )
    })

    it('accumulates each phase token cost (event telemetry) into api_cost', async () => {
      ia.analyzeGraph.mockReturnValueOnce(
        happyStream({ researchCost: 0.34, contactsCost: 0.05, classifyCost: 0.08, planCost: 0.34 }),
      )

      await worker.process(makeJob('job-cost'))

      // 0.34 + 0.05 + 0.08 + 0.34 = 0.81; flushed after every phase, so the last write is the full sum.
      expect(accountsService.setApiCost).toHaveBeenLastCalledWith('acc-1', expect.closeTo(0.81, 5))
    })

    it('persists each phase from the stream before emitting its WS pulse', async () => {
      const research = { sector: 'Transport', angles: [{ title: 'Cloud' }] }
      const contacts = [{ fullName: 'Jean Dupont', title: 'CTO' }]
      const enriched = [{ fullName: 'Jean Dupont', email: 'jean@x.fr', priority: 1 }]
      const plan = { actionPlan: { strategy: 'Bottom-up', phases: [] } }
      ia.analyzeGraph.mockReturnValueOnce(happyStream({ research, contacts, classified: enriched, plan }))

      await worker.process(makeJob('job-persist'))

      expect(persistence.saveResearch).toHaveBeenCalledWith('acc-1', 'user-1', research, expect.anything())
      expect(persistence.seedPappersContacts).toHaveBeenCalledWith('acc-1', 'user-1', research)
      // SIG-B — les recruteurs prouvés par une offre, par la même porte, juste après.
      expect(persistence.seedJobRecruiterContacts).toHaveBeenCalledWith('acc-1', 'user-1', research)
      expect(persistence.saveContacts).toHaveBeenCalledWith('acc-1', 'user-1', contacts, expect.anything())
      expect(persistence.saveEnriched).toHaveBeenCalledWith('acc-1', enriched, expect.anything(), undefined)
      expect(persistence.savePlan).toHaveBeenCalledWith('acc-1', 'user-1', plan, expect.anything())

      // saveResearch must run before the research_complete emit (UI never sees 40% without DB ready).
      const saveResearchOrder = persistence.saveResearch.mock.invocationCallOrder[0]!
      const emitResearchOrder = gateway.emitPhaseComplete.mock.invocationCallOrder.find(
        (_, i) => gateway.emitPhaseComplete.mock.calls[i]![2] === 'research_complete',
      )!
      expect(saveResearchOrder).toBeLessThan(emitResearchOrder)
    })

    // #3219 (#190.2, lot P02 07/10) — le périmètre DÉCLARÉ du run (`scopeMode`)
    // est stampé sur le blob persisté, pour que `AccountsService.applyResearch`
    // puisse journaliser la PORTÉE d'un effectif collecté sous ce périmètre.
    it('#3219 — stampe le scopeMode du run sur le blob de recherche persisté', async () => {
      const research = { sector: 'Transport', employees: '12' }
      ia.analyzeGraph.mockReturnValueOnce(happyStream({ research }))

      await worker.process(makeJob('job-scope', { scopeMode: 'business_unit' }))

      expect(persistence.saveResearch).toHaveBeenCalledWith(
        'acc-1',
        'user-1',
        { ...research, scopeMode: 'business_unit' },
        expect.anything(),
      )
    })

    it('#3219 — sans scopeMode choisi (run legacy), le blob reste inchangé (même référence)', async () => {
      const research = { sector: 'Transport' }
      ia.analyzeGraph.mockReturnValueOnce(happyStream({ research }))

      await worker.process(makeJob('job-no-scope'))

      expect(persistence.saveResearch).toHaveBeenCalledWith('acc-1', 'user-1', research, expect.anything())
    })

    it('persists the out-of-perimeter drop count carried by the contacts phase', async () => {
      // P0-03 : sans ça, le commercial voit le stock rétrécir sans explication.
      const outOfScope = { dropped: 3, entities: [{ name: 'SGTM', count: 3 }] }
      ia.analyzeGraph.mockReturnValueOnce(
        streamOf([
          phaseCompleted('research', { research: {}, gate: { decision: 'go' } }),
          phaseCompleted('contacts', { contacts: [], contacts_out_of_scope: outOfScope }),
          phaseCompleted('classify', {}),
          phaseCompleted('plan', { plan: {} }),
          { type: 'run_completed', progress: 100, data: { summary: {} } },
        ]),
      )

      await worker.process(makeJob('job-oos'))

      expect(persistence.saveContactsOutOfScope).toHaveBeenCalledWith('acc-1', outOfScope)
    })

    it('#3742/#3744 — une relance « France » écarte les contacts étrangers, nouveaux ET déjà au dossier', async () => {
      const seed = (fullName: string, country: string) => ({
        fullName,
        title: 'DSI',
        linkedinUrl: '',
        city: '',
        country,
        source: 'apollo',
      })
      ia.analyzeGraph.mockReturnValueOnce(
        streamOf([
          phaseCompleted('research', { research: {}, gate: { decision: 'go' } }),
          phaseCompleted('contacts', { contacts: [seed('Alice', 'France'), seed('Carlos', 'Spain')] }),
          phaseCompleted('classify', {}),
          phaseCompleted('plan', { plan: {} }),
          { type: 'run_completed', progress: 100, data: { summary: {} } },
        ]),
      )

      await worker.process(makeJob('job-geo', { scopeSelection: { geo_perimeter: 'france' } }))

      const saved = persistence.saveContacts.mock.calls[0]![2] as Array<{ fullName: string }>
      expect(saved.map(c => c.fullName)).toEqual(['Alice'])
      expect(persistence.excludeContactsOutsideGeo).toHaveBeenCalledWith('acc-1', { geo_perimeter: 'france' })
    })

    it('LUDB.5 — la collecte des contacts relance la purge des homonymes sur le site du compte (STILL)', async () => {
      ia.analyzeGraph.mockReturnValueOnce(
        streamOf([
          phaseCompleted('research', { research: {}, gate: { decision: 'go' } }),
          phaseCompleted('contacts', { contacts: [] }),
          phaseCompleted('classify', {}),
          phaseCompleted('plan', { plan: {} }),
          { type: 'run_completed', progress: 100, data: { summary: {} } },
        ]),
      )

      await worker.process(makeJob('job-homonym', { website: 'https://www.still.de' }))

      expect(persistence.excludeHomonymContacts).toHaveBeenCalledWith('acc-1', 'https://www.still.de', undefined)
    })

    it('#3742 — l’organigramme ne garde pas la personne écartée par le périmètre (contacts de ce run ET déjà écartés)', async () => {
      const seed = (fullName: string, country: string) => ({
        fullName,
        title: 'DSI',
        linkedinUrl: '',
        city: '',
        country,
        source: 'apollo',
      })
      const person = (id: string, fullName: string) => ({
        id,
        fullName,
        entityId: 'e1',
        identityStatus: 'classified',
        confidence: 80,
      })
      persistence.geoExcludedContactNames.mockResolvedValueOnce(['Ravi Kumar'])
      ia.analyzeGraph.mockReturnValueOnce(
        streamOf([
          phaseCompleted('research', { research: {}, gate: { decision: 'go' } }),
          phaseCompleted('contacts', { contacts: [seed('Alice Martin', 'France'), seed('Carlos Ruiz', 'Spain')] }),
          phaseCompleted('classify', {
            org_graph: {
              orgGraph: {
                people: [
                  person('p-a', 'Alice Martin'),
                  person('p-c', 'Carlos Ruiz'),
                  person('p-r', 'Ravi Kumar'),
                  person('p-n', 'Nadia Sans Pays'),
                ],
              },
            },
          }),
          phaseCompleted('plan', { plan: {} }),
          { type: 'run_completed', progress: 100, data: { summary: {} } },
        ]),
      )

      await worker.process(makeJob('job-geo-org', { scopeMode: 'france' }))

      const org = persistence.saveOrgChart.mock.calls[0]![1] as { orgGraph: { people: Array<{ fullName: string }> } }
      expect(org.orgGraph.people.map(p => p.fullName)).toEqual(['Alice Martin', 'Nadia Sans Pays'])
    })

    it('#3820 — un périmètre SITE écarte aussi les contacts hors ville, à la collecte et dans l’organigramme', async () => {
      const seed = (fullName: string, city: string) => ({
        fullName,
        title: 'DSI',
        linkedinUrl: '',
        city,
        country: 'France',
        source: 'apollo',
      })
      const person = (id: string, fullName: string) => ({
        id,
        fullName,
        entityId: 'e1',
        identityStatus: 'classified',
        confidence: 80,
      })
      ia.analyzeGraph.mockReturnValueOnce(
        streamOf([
          phaseCompleted('research', { research: {}, gate: { decision: 'go' } }),
          phaseCompleted('contacts', { contacts: [seed('Chloé Dubois', 'Lille'), seed('Bob Paris', 'Paris')] }),
          phaseCompleted('classify', {
            org_graph: {
              orgGraph: {
                people: [person('p-c', 'Chloé Dubois'), person('p-b', 'Bob Paris'), person('p-n', 'Nadia Sans Ville')],
              },
            },
          }),
          phaseCompleted('plan', { plan: {} }),
          { type: 'run_completed', progress: 100, data: { summary: {} } },
        ]),
      )

      await worker.process(makeJob('job-geo-site', { scopeSelection: { geo_perimeter: 'city', geo_areas: ['Lille'] } }))

      const savedContacts = persistence.saveContacts.mock.calls[0]![2] as Array<{ fullName: string }>
      expect(savedContacts.map(c => c.fullName)).toEqual(['Chloé Dubois'])
      expect(persistence.excludeContactsOutsideGeo).toHaveBeenCalledWith('acc-1', {
        geo_perimeter: 'city',
        geo_areas: ['Lille'],
      })

      const org = persistence.saveOrgChart.mock.calls[0]![1] as { orgGraph: { people: Array<{ fullName: string }> } }
      expect(org.orgGraph.people.map(p => p.fullName)).toEqual(['Chloé Dubois', 'Nadia Sans Ville'])
    })

    it('#3742 — le périmètre « France » choisi en PUCE (scopeMode) filtre aussi, sans cadrage géographique saisi', async () => {
      const seed = (fullName: string, country: string) => ({
        fullName,
        title: 'DSI',
        linkedinUrl: '',
        city: '',
        country,
        source: 'apollo',
      })
      ia.analyzeGraph.mockReturnValueOnce(
        streamOf([
          phaseCompleted('research', { research: {}, gate: { decision: 'go' } }),
          phaseCompleted('contacts', { contacts: [seed('Alice', 'France'), seed('Ravi', 'India')] }),
          phaseCompleted('classify', {}),
          phaseCompleted('plan', { plan: {} }),
          { type: 'run_completed', progress: 100, data: { summary: {} } },
        ]),
      )

      await worker.process(makeJob('job-geo-mode', { scopeMode: 'france' }))

      const saved = persistence.saveContacts.mock.calls[0]![2] as Array<{ fullName: string }>
      expect(saved.map(c => c.fullName)).toEqual(['Alice'])
      expect(persistence.excludeContactsOutsideGeo).toHaveBeenCalledWith('acc-1', { geo_perimeter: 'france' })
    })

    it('persists empty lists when a phase output omits its collection', async () => {
      ia.analyzeGraph.mockReturnValueOnce(
        streamOf([
          phaseCompleted('research', { research: {}, gate: { decision: 'go' } }),
          phaseCompleted('contacts', {}),
          phaseCompleted('classify', {}),
          phaseCompleted('plan', { plan: {} }),
          { type: 'run_completed', progress: 100, data: { summary: {} } },
        ]),
      )

      await worker.process(makeJob('job-empty'))

      expect(persistence.saveContacts).toHaveBeenCalledWith('acc-1', 'user-1', [], expect.anything())
      expect(persistence.saveEnriched).toHaveBeenCalledWith('acc-1', [], expect.anything(), undefined)
    })

    it('emits the phase:started pulses in order, matching the legacy timeline', async () => {
      ia.analyzeGraph.mockReturnValueOnce(happyStream())

      await worker.process(makeJob('job-started'))

      expect(gateway.emitPhaseStarted.mock.calls).toEqual([
        ['acc-1', 'job-started', 'research', 15],
        ['acc-1', 'job-started', 'contacts', 45],
        ['acc-1', 'job-started', 'classify', 72],
        ['acc-1', 'job-started', 'plan', 87],
        // #2164.10 / #2164.11 — le Judge (toujours-actif) puis la sauvegarde
        // finale émettent chacun leur pulse ; `happyStream()` les porte tous
        // les deux (voir son docblock).
        ['acc-1', 'job-started', 'quality_check', 99],
        ['acc-1', 'job-started', 'save', 99],
      ])
    })

    it('acks a user cancellation (aborted signal surfaces as AbortError) instead of failing', async () => {
      ia.analyzeGraph.mockImplementationOnce(() =>
        (async function* () {
          yield phaseCompleted('research', { research: {}, gate: { decision: 'go' } })
          // User clicks cancel mid-stream: the abort tears the SSE fetch down,
          // which surfaces as an AbortError (NOT AnalysisCancelledSignal).
          cancellation.cancel('job-cancel', 'user_cancelled')
          const abort = new Error('The operation was aborted')
          abort.name = 'AbortError'
          throw abort
        })(),
      )

      // Resolves (ack) rather than rejecting — so onFailed/markErrored never run.
      await expect(worker.process(makeJob('job-cancel'))).resolves.toBeUndefined()
      expect(gateway.emitAnalysisDone).not.toHaveBeenCalled()
    })

    it('un redéploiement remet le run en file au lieu de le classer annulé', async () => {
      // Le 16/08/2026 en production, deux fusions à trois minutes d'écart ont
      // redéployé l'API sous un run : le conteneur est mort sans rien écrire et
      // BullMQ a attendu l'expiration du verrou — 10 min de temps mort pour une
      // analyse de 5 min 30. On échoue donc TOUT DE SUITE, en rejouable.
      ia.analyzeGraph.mockImplementationOnce(() =>
        (async function* () {
          yield phaseCompleted('research', { research: {}, gate: { decision: 'go' } })
          cancellation.abortAllForShutdown()
          const abort = new Error('The operation was aborted')
          abort.name = 'AbortError'
          throw abort
        })(),
      )

      // Budget de remise en file ÉPUISÉ (#2519) : c'est l'erreur rejouable
      // ordinaire qui prend le relais (voir le bloc « coupure d'infrastructure »).
      const job = makeJob('job-redeploy', { infraRequeues: MAX_INFRA_REQUEUES })
      const err = (await worker.process(job).catch((e: unknown) => e)) as Error
      expect(requeueMocks(job).moveToDelayed).not.toHaveBeenCalled()
      expect(err).toBeInstanceOf(AnalysisWorkerRestartedError)
      // Erreur ORDINAIRE : elle roule sur le budget de tentatives de BullMQ, et
      // la reprise saute les phases déjà posées. `UnrecoverableError` la
      // clouerait au sol et perdrait le crédit du run.
      expect(err.name).toBe('AnalysisWorkerRestartedError')
      // Surtout pas la branche « annulation utilisateur », qui rend la main en
      // silence : le run serait alors perdu sans que personne ne le reprenne.
      expect(gateway.emitAnalysisDone).not.toHaveBeenCalled()
    })

    it('still fails when the stream errors without a user cancellation', async () => {
      ia.analyzeGraph.mockImplementationOnce(() =>
        (async function* () {
          yield phaseCompleted('research', { research: {}, gate: { decision: 'go' } })
          throw new Error('network exploded')
        })(),
      )

      const err = await worker.process(makeJob('job-boom')).catch((e: unknown) => e)
      expect((err as Error).message).toContain('network exploded')
    })

    it('throws an UnrecoverableError when the graph reports a real failure (never retry-looped)', async () => {
      ia.analyzeGraph.mockReturnValueOnce(
        streamOf([
          phaseCompleted('research', { research: { sector: 'X' }, gate: { decision: 'go' } }),
          {
            type: 'run_failed',
            phase: 'classify',
            progress: 75,
            data: { error: { message: 'credit balance too low' } },
          },
        ]),
      )

      const err = (await worker.process(makeJob('job-fail')).catch((e: unknown) => e)) as Error
      expect(err.message).toContain('credit balance too low')
      // A GENUINE analysis error is terminal: name === 'UnrecoverableError' makes
      // BullMQ move the job straight to failed (no 3× retry-loop through the
      // expensive phases). NOT the transient stream-cut class.
      expect(err.name).toBe('UnrecoverableError')
      expect(err).not.toBeInstanceOf(AnalysisStreamInterruptedError)
      // A failed run never signals done.
      expect(gateway.emitAnalysisDone).not.toHaveBeenCalled()
    })

    // ── The outage, reproduced at the worker ────────────────────────────────
    //
    // `phase_failed` used to splat its error object FLAT as `data` while
    // `run_failed` nested it under `data.error`. Both were handled by the same
    // `case`, which only knew the nested spelling — so every `phase_failed` read
    // `undefined`, fell through a `??` to the literal `` `${phase} failed` ``, and
    // a hard Anthropic 400 reached the customer as the word "Erreur".
    //
    // The producer was corrected to nest, and the consumer taught to read either.
    // Both of the tests below must pass FOREVER: the API and the IA deploy
    // independently, so a rolled-back IA still emits the flat shape and an
    // upgraded one emits the nested shape. Whichever arrives, the cause has to
    // reach the operator intact.
    it.each([
      [
        'FLAT (legacy IA — error object AS data)',
        { message: "'temperature' is deprecated", code: 'CLAUDE_BAD_REQUEST' },
      ],
      [
        'NESTED (current IA — error object under data.error)',
        { error: { message: "'temperature' is deprecated", code: 'CLAUDE_BAD_REQUEST' } },
      ],
    ])('surfaces the real cause of a phase_failed carried %s', async (_label, data) => {
      ia.analyzeGraph.mockReturnValueOnce(
        streamOf([
          phaseCompleted('research', { research: {}, gate: { decision: 'go' } }),
          { type: 'phase_failed', phase: 'research', progress: 25, data },
        ]),
      )

      const err = (await worker.process(makeJob('job-temp')).catch((e: unknown) => e)) as Error

      // The sentence a human reads. This is the exact assertion that would have
      // failed during the outage — it returned "research failed".
      expect(err.message).toContain("'temperature' is deprecated")
      expect(err.message).not.toMatch(/research failed$/)
      // The code is what makes the failure greppable and countable: a dashboard
      // can spike on CLAUDE_BAD_REQUEST, it can do nothing with a sentence.
      expect(err.message).toContain('CLAUDE_BAD_REQUEST')
      // Terminal, not retried: re-running would hit the same 400 four times.
      expect(err.name).toBe('UnrecoverableError')
    })

    // #2528/#2529 — a plan-phase failure lands AFTER research/contacts/classify
    // already succeeded (plan is the graph's LAST phase): the doctrine
    // "l'analyse continue avec ce qu'elle a" means the dossier finalises as
    // completed (no plan), never as an error that discards it all.
    it('finishes a PLAN-phase failure as completed (no plan) instead of throwing — dossier already landed', async () => {
      ia.analyzeGraph.mockReturnValueOnce(
        streamOf([
          phaseCompleted('research', { research: { sector: 'X' }, gate: { decision: 'go' } }),
          phaseCompleted('contacts', { contacts: [{ fullName: 'Jean' }] }),
          phaseCompleted('classify', { classified_contacts: [{ fullName: 'Jean', role: 'sponsor' }] }),
          {
            type: 'phase_failed',
            phase: 'plan',
            progress: 90,
            data: {
              error: {
                code: 'InstructorRetryException',
                message: 'The output is incomplete due to a max_tokens length limit.',
              },
            },
          },
          // The graph routes any phase error straight to END, so the generator
          // still yields a terminal `run_failed` for the SAME failure right
          // after — the worker must not double-process it.
          {
            type: 'run_failed',
            phase: 'plan',
            progress: 90,
            data: {
              error: {
                code: 'InstructorRetryException',
                message: 'The output is incomplete due to a max_tokens length limit.',
              },
            },
          },
        ]),
      )

      await expect(worker.process(makeJob('job-plan-fail'))).resolves.toBeUndefined()
      expect(accountsService.markCompleted).toHaveBeenCalledWith('acc-1')
      expect(accountsService.markErrored).not.toHaveBeenCalled()
      expect(persistence.recordAnalysisCompleted).toHaveBeenCalledWith('acc-1', 'user-1')
      expect(gateway.emitAnalysisDone).toHaveBeenCalledWith('acc-1', 'job-plan-fail')
      expect(gateway.emitAnalysisError).not.toHaveBeenCalled()
    })

    it('still throws UnrecoverableError for a non-plan phase failure — the dossier itself is incomplete', async () => {
      ia.analyzeGraph.mockReturnValueOnce(
        streamOf([
          phaseCompleted('research', { research: {}, gate: { decision: 'go' } }),
          {
            type: 'phase_failed',
            phase: 'contacts',
            progress: 50,
            data: { error: { code: 'APOLLO_DOWN', message: 'Apollo unreachable' } },
          },
        ]),
      )

      const err = (await worker.process(makeJob('job-contacts-fail')).catch((e: unknown) => e)) as Error
      expect(err.name).toBe('UnrecoverableError')
      expect(accountsService.markCompleted).not.toHaveBeenCalled()
    })

    it('throws a RETRYABLE AnalysisStreamInterruptedError when a truncated stream left the dossier incomplete', async () => {
      // A GENUINELY incomplete run (a mid-run redeploy cut before plan landed): no
      // dossier to salvage, so the resilience path can't finalise it. This must
      // throw the TYPED retryable error so BullMQ auto-retries on its attempts
      // budget (the retry resumes) — NOT an UnrecoverableError, which would strand
      // it. The user only sees the French banner once the budget is exhausted.
      ia.analyzeGraph.mockReturnValueOnce(
        streamOf([
          phaseCompleted('research', { research: {}, gate: { decision: 'go' } }),
          phaseCompleted('contacts', { contacts: [] }),
          // Stream just ends — no classify / plan / run_completed / run_skipped.
        ]),
      )

      // Budget de remise en file ÉPUISÉ (#2519) : l'erreur rejouable ordinaire.
      const err = (await worker
        .process(makeJob('job-trunc', { infraRequeues: MAX_INFRA_REQUEUES }))
        .catch((e: unknown) => e)) as Error
      expect(err).toBeInstanceOf(AnalysisStreamInterruptedError)
      // Retryable: name is NOT 'UnrecoverableError', so BullMQ retries it.
      expect(err.name).toBe('AnalysisStreamInterruptedError')
      // The user-facing banner text is preserved for the exhausted-retries fallback.
      expect(err.message).toContain('interrompue avant la fin')
      expect(gateway.emitAnalysisDone).not.toHaveBeenCalled()
    })

    // #3820.c — la recette prod du 08/10 n'a trouvé AUCUN log journalisant la
    // cause avant la tentative suivante : seul le bandeau générique French
    // ("flux SSE tronqué") survivait, sans dire QUELLE phase manquait. Un run
    // qui échoue silencieusement doit journaliser ce qu'il sait AVANT de lever
    // l'erreur rejouable.
    it('journalise la cause (phases manquantes) avant de lever l’erreur rejouable (#3820.c)', async () => {
      const errorSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
      ia.analyzeGraph.mockReturnValueOnce(
        streamOf([
          phaseCompleted('research', { research: {}, gate: { decision: 'go' } }),
          phaseCompleted('contacts', { contacts: [] }),
          // Le flux s'arrête ici — ni classify, ni plan, ni événement terminal.
        ]),
      )

      await worker.process(makeJob('job-trunc-cause', { infraRequeues: MAX_INFRA_REQUEUES })).catch(() => undefined)

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('tronqué'),
        expect.objectContaining({
          jobId: 'job-trunc-cause',
          accountId: 'acc-1',
          missingPhases: ['classify', 'plan'],
          persistedPhases: expect.arrayContaining(['research', 'contacts']),
        }),
      )
      errorSpy.mockRestore()
    })

    it('auto-retry RESUMES a truncated run: attempt 2 sends resume:true and completes (no re-bill of landed phases)', async () => {
      // Attempt 1 cuts mid-run (research+contacts landed, then the SSE dies) →
      // AnalysisStreamInterruptedError. The persistence TX wrote the outbox
      // phase_completed events, so on the BullMQ retry loadCompletedPhases returns
      // {research, contacts}. Attempt 2 must call analyzeGraph with resume:true and
      // reach completion — proving the retry self-heals via checkpointer resume
      // rather than re-running (and re-paying) the landed phases.
      ia.analyzeGraph.mockReturnValueOnce(
        streamOf([
          phaseCompleted('research', { research: {}, gate: { decision: 'go' } }),
          phaseCompleted('contacts', { contacts: [] }),
          // Stream dies here — no terminal event.
        ]),
      )
      const attempt1 = (await worker.process(makeJob('job-heal')).catch((e: unknown) => e)) as Error
      // #2519 — la coupure remet le run en file SANS consommer de tentative ;
      // la reprise qui suit est la même que sur le budget de tentatives.
      expect(attempt1).toBeInstanceOf(DelayedError)

      // Scope the "not re-persisted" assertions below to attempt 2 only — attempt 1
      // legitimately persisted research+contacts before the cut.
      persistence.saveResearch.mockClear()
      persistence.saveContacts.mockClear()

      // BullMQ re-picks the SAME job. The outbox now carries the two landed phases.
      checkpoints.loadCompletedPhases.mockResolvedValueOnce(new Set(['research', 'contacts']))
      // On resume the graph skips the landed phases and streams only classify+plan.
      ia.analyzeGraph.mockReturnValueOnce(
        streamOf([
          { type: 'phase_skipped', phase: 'research', progress: 25, data: {} },
          { type: 'phase_skipped', phase: 'contacts', progress: 50, data: {} },
          phaseCompleted('classify', { classified_contacts: [{ fullName: 'Jean' }] }),
          phaseCompleted('plan', { plan: { actionPlan: {} } }),
          { type: 'run_completed', progress: 100, data: { summary: {} } },
        ]),
      )

      await worker.process(makeJob('job-heal', {}, { attemptsStarted: 2, opts: { attempts: 3 } }))

      // Attempt 2 requested a resume run…
      const resumeInput = ia.analyzeGraph.mock.calls[1]![0] as { resume: boolean }
      expect(resumeInput.resume).toBe(true)
      // …the already-landed phases were NOT re-persisted (no re-bill)…
      expect(persistence.saveResearch).not.toHaveBeenCalled()
      expect(persistence.saveContacts).not.toHaveBeenCalled()
      // …and the run finished cleanly.
      expect(gateway.emitAnalysisDone).toHaveBeenCalledWith('acc-1', 'job-heal')
      expect(gateway.emitAnalysisError).not.toHaveBeenCalled()
    })

    it('surfaces a DB persistence error with its REAL cause, not the generic truncation banner', async () => {
      // The QONTO class: a persist write fails a CHECK constraint on an LLM-derived
      // value. This must fail with a DIAGNOSABLE message carrying the real cause and
      // the phase — NEVER be mis-reported as "flux SSE tronqué" (reserved for a
      // genuinely lost terminal event). The original cause is preserved for Sentry.
      const dbError = new Error(
        'new row for relation "account_vocabulary" violates check constraint "account_vocabulary_kind_check"',
      )
      persistence.saveResearch.mockRejectedValueOnce(dbError)
      ia.analyzeGraph.mockReturnValueOnce(happyStream())

      const err = (await worker.process(makeJob('job-dberr')).catch((e: unknown) => e)) as Error & { cause?: unknown }
      expect(err.message).toContain('account_vocabulary_kind_check') // real cause surfaced
      expect(err.message).toContain('research') // which phase failed
      expect(err.message).not.toContain('flux SSE tronqué') // NOT the truncation wording
      expect(err.cause).toBe(dbError) // original error preserved for post-mortem
      // Terminal, NOT retryable: a CHECK-constraint violation is deterministic, so
      // it is thrown as UnrecoverableError (never retry-looped 3× through the phase).
      expect(err.name).toBe('UnrecoverableError')
      expect(err).not.toBeInstanceOf(AnalysisStreamInterruptedError)
      expect(gateway.emitAnalysisDone).not.toHaveBeenCalled()
    })

    it('completes a stream truncated AFTER the full dossier was persisted (terminal event lost)', async () => {
      // Root-cause scenario (Blablacar): all four phases landed and savePlan
      // already flipped the account to 'completed', but the run_completed event
      // never arrived (proxy cut / post-plan blip). The worker must judge success
      // on the WORK DONE and finalise as completed — NOT flip a complete dossier
      // back to 'error'.
      ia.analyzeGraph.mockReturnValueOnce(
        streamOf([
          phaseCompleted('research', { research: { sector: 'Transport' }, gate: { decision: 'go' } }),
          phaseCompleted('contacts', { contacts: [{ fullName: 'Jean' }] }),
          phaseCompleted('classify', { classified_contacts: [{ fullName: 'Jean' }] }),
          phaseCompleted('plan', { plan: { actionPlan: {} } }),
          // Stream ends here — no judge / run_completed.
        ]),
      )

      await expect(worker.process(makeJob('job-trunc-ok'))).resolves.toBeUndefined()

      expect(persistence.savePlan).toHaveBeenCalled()
      expect(gateway.emitAnalysisDone).toHaveBeenCalledWith('acc-1', 'job-trunc-ok')
      expect(runs.completeLatest).toHaveBeenCalledWith('acc-1', expect.objectContaining({ status: 'completed' }))
      expect(gateway.emitAnalysisError).not.toHaveBeenCalled()
    })

    it('completes a resumed run truncated after only the plan streamed (prior phases skipped)', async () => {
      // Resume: research/contacts/classify were skipped (they landed on a prior
      // attempt) and only plan re-ran. The terminal event is lost, but the union
      // of skipped + newly-persisted phases is the whole dossier → success.
      ia.analyzeGraph.mockReturnValueOnce(
        streamOf([
          { type: 'phase_skipped', phase: 'research', progress: 25, data: {} },
          { type: 'phase_skipped', phase: 'contacts', progress: 50, data: {} },
          { type: 'phase_skipped', phase: 'classify', progress: 75, data: {} },
          phaseCompleted('plan', { plan: { actionPlan: {} } }),
          // No run_completed.
        ]),
      )

      await expect(worker.process(makeJob('job-resume-trunc'))).resolves.toBeUndefined()
      expect(gateway.emitAnalysisDone).toHaveBeenCalledWith('acc-1', 'job-resume-trunc')
      expect(gateway.emitAnalysisError).not.toHaveBeenCalled()
    })

    it('completes a gate no-go whose run_skipped terminal was lost (research-only dossier)', async () => {
      // Research returned a no-go and the stream cut before run_skipped. A no-go
      // is a legitimate research-only terminal — finalise as completed, not error,
      // and never run downstream phases.
      ia.analyzeGraph.mockReturnValueOnce(
        streamOf([
          phaseCompleted('research', { research: { sector: 'X' }, gate: { decision: 'no_go' } }),
          // Stream ends — no run_skipped.
        ]),
      )

      await expect(worker.process(makeJob('job-nogo-trunc'))).resolves.toBeUndefined()
      expect(accountsService.markCompleted).toHaveBeenCalledWith('acc-1')
      expect(persistence.saveContacts).not.toHaveBeenCalled()
      expect(gateway.emitAnalysisDone).toHaveBeenCalledWith('acc-1', 'job-nogo-trunc')
    })

    it('finishes a gate no-go (run_skipped) by marking completed without downstream phases', async () => {
      ia.analyzeGraph.mockReturnValueOnce(
        streamOf([
          phaseCompleted('research', { research: {}, gate: { decision: 'no_go' } }),
          { type: 'run_skipped', phase: 'research', progress: 25, data: { gate: { decision: 'no_go' }, summary: {} } },
        ]),
      )

      await worker.process(makeJob('job-nogo'))

      expect(accountsService.markCompleted).toHaveBeenCalledWith('acc-1')
      expect(persistence.saveContacts).not.toHaveBeenCalled()
      expect(gateway.emitAnalysisDone).toHaveBeenCalledWith('acc-1', 'job-nogo')
    })

    describe('ré-analyse d’un compte déjà analysé (désynchro de checkpoint)', () => {
      // Le checkpointer du graphe est durable et indexé sur le compte, et sa
      // liste `completed` ne fait que grandir. Relancer une analyse rouvre donc
      // un thread où les quatre phases sont déjà marquées faites : le graphe
      // saute tout. `plan` sauté n'écrivait RIEN — ni le plan, ni le passage du
      // compte en `completed` — pendant que le run s'annonçait en succès.
      const fullySkippedStream = () =>
        streamOf([
          { type: 'phase_skipped', phase: 'research', progress: 25, data: {} },
          { type: 'phase_skipped', phase: 'contacts', progress: 50, data: {} },
          { type: 'phase_skipped', phase: 'classify', progress: 75, data: {} },
          { type: 'phase_skipped', phase: 'plan', progress: 100, data: {} },
          { type: 'run_completed', progress: 100, data: { summary: {} } },
        ])

      it('borne la reprise au job courant, pas à tout l’historique du compte', async () => {
        ia.analyzeGraph.mockReturnValueOnce(happyStream())

        await worker.process(makeJob('job-scope'))

        expect(checkpoints.loadCompletedPhases).toHaveBeenCalledWith('acc-1', 'job-scope', expect.anything())
      })

      it('borne AUSSI la reprise au run courant — le jobId seul ne sépare pas deux analyses', async () => {
        // Le `jobId` est déterministe (même utilisateur + même entreprise = même
        // identifiant) : la borne du job ne distingue donc PAS la relance
        // d'aujourd'hui du run du mois dernier. Sans cette seconde borne, une
        // « actualisation » repartait avec `resume: true` et sautait recherche,
        // contacts et classification — elle ne re-collectait rien tout en
        // débitant son crédit.
        ia.analyzeGraph.mockReturnValueOnce(happyStream())

        await worker.process(makeJob('job-scope'))

        expect(runs.latestStartedAt).toHaveBeenCalledWith('acc-1')
        expect(checkpoints.loadCompletedPhases).toHaveBeenCalledWith('acc-1', 'job-scope', RUN_STARTED_AT)
      })

      it('borne le THREAD du graphe au run courant, pas au seul jobId (#1187)', async () => {
        // La moitié manquante de la borne ci-dessus. Le thread du checkpointer
        // LangGraph est `account_id:run_id` et `run_id` valait le `jobId`, qui
        // est DÉTERMINISTE — deux analyses successives du même compte par le
        // même utilisateur partageaient donc le même thread. Or le graphe court-
        // circuite toute phase présente dans `completed` (`nodes.py:_already_done`),
        // et `graph_analyze.py` le dit lui-même : « A durable checkpointer still
        // restores ``completed`` from the thread, so landed phases stay skipped
        // REGARDLESS of what we pass here » — donc `resume: false` n'y change rien.
        // Une relance héritait des marqueurs du run précédent, ne rejouait rien,
        // et retombait sur le même mur : c'est « bug malgré 3 relances ».
        ia.analyzeGraph.mockReturnValueOnce(happyStream())
        await worker.process(makeJob('job-thread'))
        const firstRun = (ia.analyzeGraph.mock.calls[0]![0] as { runId?: string }).runId

        // Un run PLUS RÉCENT du même compte (même jobId déterministe) doit
        // obtenir un thread DIFFÉRENT — sinon il repart sur les points de
        // contrôle de celui d'avant.
        runs.latestStartedAt.mockResolvedValue(new Date('2026-08-28T09:00:00.000Z'))
        ia.analyzeGraph.mockReturnValueOnce(happyStream())
        await worker.process(makeJob('job-thread'))
        const secondRun = (ia.analyzeGraph.mock.calls[1]![0] as { runId?: string }).runId

        expect(firstRun).toBeTruthy()
        expect(secondRun).toBeTruthy()
        expect(secondRun).not.toBe(firstRun)
        // Le jobId reste dedans : c'est lui qui rend le thread lisible en log.
        expect(firstRun).toContain('job-thread')
      })

      it('garde le MÊME thread entre les tentatives BullMQ d’un même run (#1187)', async () => {
        // La contrepartie : une reprise (tentative 2, ou le bouton « Reprendre »)
        // ne crée pas de ligne `analysis_runs`, donc `latestStartedAt` ne bouge
        // pas — et le thread ne doit pas bouger non plus, sinon on re-paierait
        // les phases déjà landées. C'est la promesse que le fix ne casse pas.
        ia.analyzeGraph.mockReturnValueOnce(happyStream())
        await worker.process(makeJob('job-attempt'))
        ia.analyzeGraph.mockReturnValueOnce(happyStream())
        await worker.process(makeJob('job-attempt', {}, { attemptsStarted: 2, opts: { attempts: 3 } }))

        const first = (ia.analyzeGraph.mock.calls[0]![0] as { runId?: string }).runId
        const second = (ia.analyzeGraph.mock.calls[1]![0] as { runId?: string }).runId
        expect(second).toBe(first)
      })

      it('finalise un plan légitimement sauté au lieu de laisser le compte en `analyzing`', async () => {
        // Le plan est bien en base (il a landé lors d'un run précédent) : sauter
        // son calcul est légitime, mais le compte doit quand même basculer.
        persistence.hasPersistedPlan.mockResolvedValue(true)
        ia.analyzeGraph.mockReturnValueOnce(fullySkippedStream())

        await worker.process(makeJob('job-skip-all'))

        expect(accountsService.markCompleted).toHaveBeenCalledWith('acc-1')
        expect(persistence.recordAnalysisCompleted).toHaveBeenCalledWith('acc-1', 'user-1')
        expect(gateway.emitAnalysisDone).toHaveBeenCalledWith('acc-1', 'job-skip-all')
      })

      it('émet le pulse de fin de plan — le tiroir ne doit pas rester figé à 87 %', async () => {
        persistence.hasPersistedPlan.mockResolvedValue(true)
        ia.analyzeGraph.mockReturnValueOnce(fullySkippedStream())

        await worker.process(makeJob('job-skip-pulse'))

        expect(gateway.emitPhaseComplete).toHaveBeenCalledWith(
          'acc-1',
          'job-skip-pulse',
          'plan_complete',
          100,
          undefined,
        )
      })

      it('n’annonce JAMAIS un succès quand le graphe a sauté un plan que la base n’a jamais reçu', async () => {
        // Le cas DARTY : le checkpoint ment. Un run qui n'a rien produit ne doit
        // ni fermer l'historique en succès, ni notifier « Dossier prêt ».
        persistence.hasPersistedPlan.mockResolvedValue(false)
        ia.analyzeGraph.mockReturnValueOnce(fullySkippedStream())

        await expect(worker.process(makeJob('job-skip-lie'))).rejects.toThrow(/plan/i)

        expect(gateway.emitAnalysisDone).not.toHaveBeenCalled()
        expect(integrations.notifyUser).not.toHaveBeenCalled()
        expect(runs.completeLatest).not.toHaveBeenCalledWith('acc-1', expect.objectContaining({ status: 'completed' }))
      })
    })

    it('stores the anti-hallucination judge verdict from a judge_completed event', async () => {
      const verdict = {
        passed: false,
        verdict: 'flagged',
        issues: [{ type: 'fact_without_source', severity: 'critical', detail: 'x', phase: 'research' }],
        confidence: 0.65,
      }
      ia.analyzeGraph.mockReturnValueOnce(happyStream({ judge: verdict }))

      await worker.process(makeJob('job-judge'))

      expect(persistence.saveJudge).toHaveBeenCalledWith('acc-1', verdict)
      // The judge is advisory — the run still completes normally.
      expect(gateway.emitAnalysisDone).toHaveBeenCalledWith('acc-1', 'job-judge')
    })

    it('does not fail an otherwise-completed run if persisting the judge verdict throws (advisory)', async () => {
      persistence.saveJudge.mockRejectedValueOnce(new Error('db down'))
      ia.analyzeGraph.mockReturnValueOnce(happyStream())

      await expect(worker.process(makeJob('job-judge-fail'))).resolves.toBeUndefined()
      expect(persistence.savePlan).toHaveBeenCalled()
      expect(gateway.emitAnalysisDone).toHaveBeenCalledWith('acc-1', 'job-judge-fail')
    })

    // #2164.10 — le contrôle qualité (le Judge) restait BACKEND SEUL : le
    // graphe émettait bien `judge_completed`, mais rien ne relayait jamais
    // de pulse WS pour ce moment-là, donc `STEP_KEYS` n'avait aucun 8e
    // `StepKey` à afficher.
    it('names the quality-check step on judge completion (#2164.10)', async () => {
      ia.analyzeGraph.mockReturnValueOnce(happyStream())

      await worker.process(makeJob('job-quality-check'))

      expect(gateway.emitPhaseStarted).toHaveBeenCalledWith('acc-1', 'job-quality-check', 'quality_check', 99)
    })

    // #2164.4 — la RÉUTILISATION des données existantes se dit quand le run en
    // reçoit réellement ; sans rien à réutiliser, aucune étape (jamais « faite » par défaut).
    it('names the reuse step BEFORE the first phase when existing data is reused (#2164.4)', async () => {
      ia.analyzeGraph.mockReturnValueOnce(happyStream())

      await worker.process(makeJob('job-reuse', { previousAnalysis: 'Analyse du 12/09 : DSI = Marie Dupont' }))

      const phases = gateway.emitPhaseStarted.mock.calls.map(c => c[2])
      expect(phases).toContain('reuse_existing')
      expect(phases.indexOf('reuse_existing')).toBe(0)
    })

    it('emits no reuse step when nothing existing is reused (#2164.4)', async () => {
      ia.analyzeGraph.mockReturnValueOnce(happyStream())

      await worker.process(makeJob('job-no-reuse', { accountFacts: [], knownContacts: [], previousAnalysis: '  ' }))

      expect(gateway.emitPhaseStarted.mock.calls.map(c => c[2])).not.toContain('reuse_existing')
    })

    // #2164.11 — la sauvegarde finale (historique, coût, compte rendu) est
    // réelle mais restait, elle aussi, backend seule : `STEP_KEYS`
    // s'arrêtait à `'messages'`.
    it('names the save step right before finalising the run (#2164.11)', async () => {
      ia.analyzeGraph.mockReturnValueOnce(happyStream())

      await worker.process(makeJob('job-save-step'))

      expect(gateway.emitPhaseStarted).toHaveBeenCalledWith('acc-1', 'job-save-step', 'save', 99)
      // Émis AVANT la clôture de l'historique — sinon la ligne "sauvegarde"
      // mentirait sur ce qui vient déjà d'être écrit.
      const savePulseOrder = gateway.emitPhaseStarted.mock.calls.findIndex(call => call[2] === 'save')
      const completeLatestOrder = runs.completeLatest.mock.invocationCallOrder[0]
      const savePulseCallOrder = gateway.emitPhaseStarted.mock.invocationCallOrder[savePulseOrder]
      expect(savePulseCallOrder).toBeLessThan(completeLatestOrder as number)
    })

    it('passes the job AbortSignal to the graph call', async () => {
      ia.analyzeGraph.mockReturnValueOnce(happyStream())

      await worker.process(makeJob('job-signal'))

      const opts = ia.analyzeGraph.mock.calls[0]![1] as { signal: unknown }
      expect(opts.signal).toBeInstanceOf(AbortSignal)
    })

    it('requests a resume run when a prior attempt checkpointed phases', async () => {
      ia.analyzeGraph.mockReturnValueOnce(happyStream())

      await worker.process(makeJob('job-fresh'))
      const freshInput = ia.analyzeGraph.mock.calls[0]![0] as { resume: boolean }
      expect(freshInput.resume).toBe(false)
    })

    it('emits analysis:retry on attempt >= 2', async () => {
      ia.analyzeGraph.mockReturnValueOnce(happyStream())

      await worker.process(makeJob('job-retry', {}, { attemptsStarted: 2, opts: { attempts: 3 } }))

      expect(gateway.emitAnalysisRetry).toHaveBeenCalledWith('acc-1', 'job-retry', 2, 3)
    })

    it('does not emit analysis:retry on the first attempt', async () => {
      ia.analyzeGraph.mockReturnValueOnce(happyStream())

      await worker.process(makeJob('job-first', {}, { attemptsStarted: 1 }))

      expect(gateway.emitAnalysisRetry).not.toHaveBeenCalled()
    })

    // #3820 — recette prod 08/10 : une reprise réannonçait « research » en
    // train de démarrer (log ET pulse WS) alors que cette phase avait déjà
    // landé sur une tentative précédente — un skip instantané se lisait comme
    // une phase rejouée, à l'écran comme dans les logs.
    it('n’annonce jamais une phase déjà checkpointée comme « en train de démarrer » (#3820)', async () => {
      checkpoints.loadCompletedPhases.mockResolvedValueOnce(new Set(['research']))
      ia.analyzeGraph.mockReturnValueOnce(
        streamOf([
          { type: 'phase_skipped', phase: 'research', progress: 25, data: {} },
          phaseCompleted('contacts', { contacts: [{ fullName: 'Jean' }] }),
          phaseCompleted('classify', { classified_contacts: [{ fullName: 'Jean', role: 'sponsor' }] }),
          phaseCompleted('plan', { plan: { actionPlan: {} } }),
          judgeCompleted(),
          { type: 'run_completed', progress: 100, data: { summary: {} } },
        ]),
      )

      await worker.process(makeJob('job-resumed-research', {}, { attemptsStarted: 2, opts: { attempts: 3 } }))

      expect(gateway.emitPhaseStarted).not.toHaveBeenCalledWith('acc-1', 'job-resumed-research', 'research', 15)
      // La toute première annonce porte la phase RÉELLEMENT en cours (contacts),
      // pas celle déjà sautée.
      expect(gateway.emitPhaseStarted.mock.calls[0]).toEqual(['acc-1', 'job-resumed-research', 'contacts', 45])
    })

    it('annonce toujours « research » à 15 % sur un run neuf (pas de checkpoint) — non-régression', async () => {
      ia.analyzeGraph.mockReturnValueOnce(happyStream())

      await worker.process(makeJob('job-fresh-pulse'))

      expect(gateway.emitPhaseStarted.mock.calls[0]).toEqual(['acc-1', 'job-fresh-pulse', 'research', 15])
    })
  })

  /**
   * #2519 / #2520 — « après une merge request, les analyses finissent en erreur ».
   *
   * Mesuré : une fusion redéploie l'API ET le moteur IA ; chacun coupe un run en
   * cours, et chaque coupure consommait UNE des trois tentatives. Deux fusions
   * rapprochées (11:45 et 12:05 le 17/09) suffisaient à épuiser le budget : le
   * run finissait « Analyse échouée » sans qu'aucune phase n'ait échoué. Une
   * coupure d'infrastructure remet désormais le run en file SANS consommer de
   * tentative (`DelayedError`), dans une borne à part.
   */
  describe('process() — une coupure d’infrastructure ne consomme pas de tentative (#2519, #2520)', () => {
    const shutdownStream = () =>
      (async function* () {
        yield phaseCompleted('research', { research: {}, gate: { decision: 'go' } })
        cancellation.abortAllForShutdown()
        const abort = new Error('The operation was aborted')
        abort.name = 'AbortError'
        throw abort
      })()
    const truncatedStream = () =>
      streamOf([
        phaseCompleted('research', { research: {}, gate: { decision: 'go' } }),
        phaseCompleted('contacts', { contacts: [] }),
      ])

    it('un redéploiement de l’API remet le run en file sans consommer de tentative', async () => {
      ia.analyzeGraph.mockImplementationOnce(shutdownStream)
      const job = makeJob('job-requeue-api')

      const err = await worker.process(job, 'lock-token').catch((e: unknown) => e)

      expect(err).toBeInstanceOf(DelayedError)
      expect(requeueMocks(job).updateData).toHaveBeenCalledWith(expect.objectContaining({ infraRequeues: 1 }))
      expect(requeueMocks(job).moveToDelayed).toHaveBeenCalledWith(expect.any(Number), 'lock-token')
      expect(gateway.emitAnalysisDone).not.toHaveBeenCalled()
    })

    it('un flux du moteur IA coupé en route est remis en file de la même façon', async () => {
      ia.analyzeGraph.mockReturnValueOnce(truncatedStream())
      const job = makeJob('job-requeue-ia', { infraRequeues: 2 })

      const err = await worker.process(job, 'lock-token').catch((e: unknown) => e)

      expect(err).toBeInstanceOf(DelayedError)
      expect(requeueMocks(job).updateData).toHaveBeenCalledWith(expect.objectContaining({ infraRequeues: 3 }))
      const [delayedUntil] = requeueMocks(job).moveToDelayed.mock.calls[0] as [number]
      expect(delayedUntil).toBeGreaterThan(Date.now())
    })

    it('NON — une vraie erreur d’analyse ne passe jamais par cette porte', async () => {
      ia.analyzeGraph.mockImplementationOnce(() =>
        (async function* () {
          yield phaseCompleted('research', { research: {}, gate: { decision: 'go' } })
          throw new Error('network exploded')
        })(),
      )
      const job = makeJob('job-real-error')

      const err = await worker.process(job, 'lock-token').catch((e: unknown) => e)

      expect(err).not.toBeInstanceOf(DelayedError)
      expect(requeueMocks(job).moveToDelayed).not.toHaveBeenCalled()
    })

    it('NON — au-delà de la borne, la coupure reprend le budget de tentatives ordinaire', async () => {
      ia.analyzeGraph.mockReturnValueOnce(truncatedStream())
      const job = makeJob('job-requeue-exhausted', { infraRequeues: MAX_INFRA_REQUEUES })

      const err = await worker.process(job, 'lock-token').catch((e: unknown) => e)

      expect(err).toBeInstanceOf(AnalysisStreamInterruptedError)
      expect(requeueMocks(job).moveToDelayed).not.toHaveBeenCalled()
    })

    it('une remise en file impossible (Redis) laisse remonter l’erreur rejouable ordinaire', async () => {
      ia.analyzeGraph.mockReturnValueOnce(truncatedStream())
      const job = makeJob('job-requeue-redis-down')
      requeueMocks(job).moveToDelayed.mockRejectedValueOnce(new Error('Connection is closed.'))

      const err = await worker.process(job, 'lock-token').catch((e: unknown) => e)

      expect(err).toBeInstanceOf(AnalysisStreamInterruptedError)
    })

    it('le numéro de tentative annoncé ne compte pas les remises en file', async () => {
      ia.analyzeGraph.mockReturnValueOnce(happyStream())
      // 3 démarrages, dont 2 remises en file : c'est toujours la 1re tentative.
      await worker.process(makeJob('job-after-requeues', { infraRequeues: 2 }, { attemptsStarted: 3 }))

      expect(gateway.emitAnalysisRetry).not.toHaveBeenCalled()
    })
  })

  /**
   * #2164.17 — corriger une ambiguïté PENDANT le job : la recherche d'un run
   * lancé par NOM rend deux homonymes ⇒ le job se met en pause (différé) avec
   * sa question, au lieu de payer contacts et plan sur une hypothèse.
   */
  describe('process() — pause sur une identité ambiguë, puis reprise (#2164.17)', () => {
    const ambiguousResearch = {
      sector: 'Banque',
      entity_resolution: {
        state: 'ambiguous',
        kind: null,
        canonical_id: null,
        commercial_name: 'BPCE',
        legal_name: null,
        country: 'FR',
        identifiers: { siren: '493455042' },
        domain: null,
        naf_code: null,
        naf_label: null,
        location: null,
        parent_names: [],
        children_count: null,
        sources: ['legal_identifier'],
        confidence: 40,
        reasons: [],
        question: {
          candidates: [
            { name: 'BPCE', siren: '493455042', city: 'Paris' },
            { name: 'BPCE Lease', siren: '332357286', city: null },
          ],
        },
        resolved_at: '2026-11-01T10:00:00.000Z',
      },
    }
    const QUESTION = {
      candidates: [
        { name: 'BPCE', siren: '493455042', city: 'Paris' },
        { name: 'BPCE Lease', siren: '332357286', city: null },
      ],
      hypothesisSiren: '493455042',
      askedAt: '2026-11-01T10:00:00.000Z',
      expiresAt: '2026-11-01T10:05:00.000Z',
    }
    const graphInput = (): { siren?: string | null; resume?: boolean; runId?: string } =>
      ia.analyzeGraph.mock.calls[0][0] as { siren?: string | null; resume?: boolean; runId?: string }

    it('met le job en pause avec sa question, sans persister les phases suivantes', async () => {
      ia.analyzeGraph.mockReturnValueOnce(happyStream({ research: ambiguousResearch }))
      const job = makeJob('job-ambiguous')

      const err = await worker.process(job, 'lock-token').catch((e: unknown) => e)

      expect(err).toBeInstanceOf(DelayedError)
      const [data] = requeueMocks(job).updateData.mock.calls[0] as [AnalysisJobData]
      expect(data.entityQuestion).toMatchObject({ candidates: QUESTION.candidates, hypothesisSiren: '493455042' })
      const [until, token] = requeueMocks(job).moveToDelayed.mock.calls[0] as [number, string]
      expect(until).toBe(Date.parse((data.entityQuestion as { expiresAt: string }).expiresAt))
      expect(token).toBe('lock-token')
      expect(persistence.saveResearch).toHaveBeenCalled()
      expect(persistence.saveContacts).not.toHaveBeenCalled()
      expect(gateway.emitAnalysisDone).not.toHaveBeenCalled()
      expect(accountsService.markErrored).not.toHaveBeenCalled()
    })

    it('NON — un run au SIREN verrouillé ne se met jamais en pause', async () => {
      ia.analyzeGraph.mockReturnValueOnce(happyStream({ research: ambiguousResearch }))
      const job = makeJob('job-locked', { siren: '493455042' })

      await worker.process(job, 'lock-token')

      expect(requeueMocks(job).moveToDelayed).not.toHaveBeenCalled()
      expect(gateway.emitAnalysisDone).toHaveBeenCalledWith('acc-1', 'job-locked')
    })

    it('réponse = une AUTRE entité : la recherche repart, verrouillée sur le SIREN choisi', async () => {
      checkpoints.loadCompletedPhases.mockResolvedValueOnce(new Set(['research']))
      ia.analyzeGraph.mockReturnValueOnce(happyStream())
      const job = makeJob('job-answered-other', {
        entityQuestion: QUESTION,
        entityAnswer: { siren: '332357286', answeredAt: '2026-11-01T10:01:00.000Z' },
      })

      await worker.process(job, 'lock-token')

      expect(graphInput().siren).toBe('332357286')
      expect(graphInput().resume).toBe(false)
      expect(graphInput().runId).toContain('332357286')
      expect(gateway.emitAnalysisDone).toHaveBeenCalled()
    })

    it('réponse = l’hypothèse : la recherche déjà payée est gardée (reprise)', async () => {
      checkpoints.loadCompletedPhases.mockResolvedValueOnce(new Set(['research']))
      ia.analyzeGraph.mockReturnValueOnce(
        streamOf([
          phaseCompleted('contacts', { contacts: [{ fullName: 'Jean' }] }),
          phaseCompleted('classify', { classified_contacts: [{ fullName: 'Jean', role: 'sponsor' }] }),
          phaseCompleted('plan', { plan: { actionPlan: {} } }),
          { type: 'run_completed', progress: 100, data: { summary: {} } },
        ]),
      )
      const job = makeJob('job-answered-same', {
        entityQuestion: QUESTION,
        entityAnswer: { siren: '493455042', answeredAt: '2026-11-01T10:01:00.000Z' },
      })

      await worker.process(job, 'lock-token')

      expect(graphInput().resume).toBe(true)
      expect(gateway.emitAnalysisDone).toHaveBeenCalled()
    })

    it('NON — sans réponse avant l’échéance, le run reprend sur l’hypothèse et ne se remet jamais en pause', async () => {
      ia.analyzeGraph.mockReturnValueOnce(happyStream({ research: ambiguousResearch }))
      const job = makeJob('job-expired', { entityQuestion: QUESTION })

      await worker.process(job, 'lock-token')

      expect(requeueMocks(job).moveToDelayed).not.toHaveBeenCalled()
      expect(gateway.emitAnalysisDone).toHaveBeenCalled()
    })
  })

  describe('onFailed() — credit refund (Théo §7 billing)', () => {
    const boom = new Error('graph blew up')

    it('refunds the analysis slot on a terminal failure when a slot was consumed', async () => {
      await worker.onFailed(makeJob('job-x', { slotConsumed: true }, { attemptsMade: 1, opts: { attempts: 1 } }), boom)
      expect(credits.refundAnalysisSlot).toHaveBeenCalledWith('user-1', expect.objectContaining({ accountId: 'acc-1' }))
      expect(accountsService.markErrored).toHaveBeenCalledWith('acc-1', 'graph blew up')
    })

    it('does NOT refund a force launch that never claimed a slot', async () => {
      await worker.onFailed(makeJob('job-x', { slotConsumed: false }, { attemptsMade: 1, opts: { attempts: 1 } }), boom)
      expect(credits.refundAnalysisSlot).not.toHaveBeenCalled()
    })

    it('does NOT refund on a non-terminal (will-retry) failure', async () => {
      await worker.onFailed(makeJob('job-x', { slotConsumed: true }, { attemptsMade: 1, opts: { attempts: 3 } }), boom)
      expect(credits.refundAnalysisSlot).not.toHaveBeenCalled()
      expect(accountsService.markErrored).not.toHaveBeenCalled()
    })

    it('marks the run history (Théo P0) as error on a terminal failure', async () => {
      await worker.onFailed(makeJob('job-x', { slotConsumed: true }, { attemptsMade: 1, opts: { attempts: 1 } }), boom)
      expect(runs.completeLatest).toHaveBeenCalledWith('acc-1', { status: 'error' })
    })

    it('does NOT touch the run history on a non-terminal (will-retry) failure', async () => {
      await worker.onFailed(makeJob('job-x', { slotConsumed: true }, { attemptsMade: 1, opts: { attempts: 3 } }), boom)
      expect(runs.completeLatest).not.toHaveBeenCalled()
    })
  })

  describe('onFailed() — unknown vs failed outcome (#2478)', () => {
    it('ne bascule PAS le compte à `error` quand le flux SSE a été tronqué et les tentatives sont épuisées (requête partie sans réponse)', async () => {
      await worker.onFailed(
        makeJob('job-x', { slotConsumed: true }, { attemptsMade: 1, opts: { attempts: 1 } }),
        new AnalysisStreamInterruptedError('SNCF'),
      )
      expect(accountsService.markErrored).not.toHaveBeenCalled()
      expect(runs.completeLatest).not.toHaveBeenCalled()
      expect(credits.refundAnalysisSlot).not.toHaveBeenCalled()
      expect(gateway.emitAnalysisError).not.toHaveBeenCalled()
    })

    it('ne bascule PAS le compte à `error` sur un redémarrage worker dont les tentatives sont épuisées', async () => {
      await worker.onFailed(
        makeJob('job-x', { slotConsumed: true }, { attemptsMade: 1, opts: { attempts: 1 } }),
        new AnalysisWorkerRestartedError('SNCF'),
      )
      expect(accountsService.markErrored).not.toHaveBeenCalled()
      expect(runs.completeLatest).not.toHaveBeenCalled()
      expect(credits.refundAnalysisSlot).not.toHaveBeenCalled()
      expect(gateway.emitAnalysisError).not.toHaveBeenCalled()
    })

    it('garde une trace DLQ même sur un outcome `unknown` — visibilité opérateur, jamais une affirmation vers l’utilisateur', async () => {
      await worker.onFailed(
        makeJob('job-x', { slotConsumed: true }, { attemptsMade: 1, opts: { attempts: 1 } }),
        new AnalysisStreamInterruptedError('SNCF'),
      )
      expect(dlq.add).toHaveBeenCalledWith('terminal-failure', expect.objectContaining({ outcome: 'unknown' }))
    })

    it('bascule TOUJOURS le compte à `error` sur une vraie erreur réseau jamais partie (ECONNREFUSED) — ne classe pas un échec réel en `unknown`', async () => {
      const neverLeft = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })
      await worker.onFailed(
        makeJob('job-x', { slotConsumed: true }, { attemptsMade: 1, opts: { attempts: 1 } }),
        neverLeft,
      )
      expect(accountsService.markErrored).toHaveBeenCalledWith('acc-1', 'connect ECONNREFUSED')
      expect(runs.completeLatest).toHaveBeenCalledWith('acc-1', { status: 'error' })
      expect(credits.refundAnalysisSlot).toHaveBeenCalled()
      expect(gateway.emitAnalysisError).toHaveBeenCalled()
      expect(dlq.add).toHaveBeenCalledWith('terminal-failure', expect.objectContaining({ outcome: 'failed' }))
    })
  })

  describe('crash isolation + readiness (worker self-recovery)', () => {
    it('a throwing job REJECTS process() (BullMQ fails that job) — the rejection is contained, not a process crash', async () => {
      ia.analyzeGraph.mockImplementationOnce(() =>
        (async function* () {
          yield phaseCompleted('research', { research: {}, gate: { decision: 'go' } })
          throw new Error('phase blew up')
        })(),
      )

      // process() returns a REJECTED promise — that is exactly how BullMQ marks
      // THIS job failed (+ retries per `attempts`). The throw is delivered to the
      // caller via the promise, never as an unhandled process-level exception.
      await expect(worker.process(makeJob('job-crash'))).rejects.toThrow('phase blew up')
      expect(gateway.emitAnalysisDone).not.toHaveBeenCalled()
    })

    it('onError logs a worker-level error and NEVER throws (the process stays up)', () => {
      expect(() => worker.onError(new Error('Redis connection is closed'))).not.toThrow()
    })

    it('registers a liveness probe that mirrors the underlying worker.isRunning() for /health/ready', () => {
      // No underlying BullMQ Worker yet (built during Nest bootstrap) → not live.
      expect(readinessRegistry.isLive(ANALYSIS_WORKER_NAME)).toBe(false)

      // Once the BullMQ Worker exists and its run loop is going, the probe flips.
      ;(worker as unknown as { _worker: { isRunning: () => boolean } })._worker = { isRunning: () => true }
      expect(readinessRegistry.isLive(ANALYSIS_WORKER_NAME)).toBe(true)

      // A stopped worker (graceful shutdown / dead run loop) reads as not-ready.
      ;(worker as unknown as { _worker: { isRunning: () => boolean } })._worker = { isRunning: () => false }
      expect(readinessRegistry.isLive(ANALYSIS_WORKER_NAME)).toBe(false)
    })
  })
  // The per-phase accumulator only ever saw LLM token cost, so the billing
  // screen understated every analysis by the whole provider spend (Apollo
  // credits, Firecrawl pages, Pappers lookups…). The terminal event carries the
  // real total; these pin that it is what gets billed and stored.
  const FULL_SUMMARY = {
    summary: {
      total_cost_usd: 1.53,
      total_llm_cost_usd: 1.11,
      providers: {
        claude: { calls: 4, errors: 0, duration_ms: 42_000, wait_ms: 300, cost_usd: 1.11, unit_cost_usd: 0 },
        apollo: { calls: 12, errors: 1, duration_ms: 9_000, wait_ms: 1_200, cost_usd: 0.42, unit_cost_usd: 0.02 },
      },
      degraded_sources: [{ source: 'pappers', reason: 'quota dépassé' }],
    },
  }

  const streamEndingWith = (terminal: GraphEventLite): GraphEventLite[] => [
    phaseCompleted('research', { research: { companyName: 'ACME' }, gate: { decision: 'go' } }, 1.11),
    phaseCompleted('contacts', {}),
    phaseCompleted('classify', {}),
    phaseCompleted('plan', { plan: {} }),
    terminal,
  ]

  it('bills the full cost, not the LLM-only figure the phases accumulated', async () => {
    ia.analyzeGraph.mockReturnValueOnce(
      streamOf(streamEndingWith({ type: 'run_completed', progress: 100, data: FULL_SUMMARY })),
    )

    await worker.process(makeJob('job-cost-full'))

    expect(accountsService.setApiCost.mock.calls.at(-1)?.[1]).toBeCloseTo(1.53, 6)
  })

  it('stores the per-provider breakdown so the backoffice can show where it went', async () => {
    ia.analyzeGraph.mockReturnValueOnce(
      streamOf(streamEndingWith({ type: 'run_completed', progress: 100, data: FULL_SUMMARY })),
    )

    await worker.process(makeJob('job-cost-breakdown'))

    const stored = accountsService.applyRunCostBreakdown.mock.calls.at(-1)?.[1] as {
      totalCostUsd: number
      providers: Array<{ provider: string; costUsd: number }>
      degradedSources: Array<{ source: string; reason: string }>
    }
    expect(stored.totalCostUsd).toBeCloseTo(1.53, 6)
    expect(stored.providers.map(p => p.provider)).toEqual(['claude', 'apollo'])
    expect(stored.degradedSources).toEqual([{ source: 'pappers', reason: 'quota dépassé' }])
  })

  it('stamps the run history with which sources degraded and which were called', async () => {
    // The append-only run row is the ONLY place a per-source status can be
    // dated honestly: re-analysing an account overwrites its `accounts` row,
    // so the previous run's degradations were erased. Without this stamp, the
    // "Pappers est HS depuis 3 h" question has no data to answer from.
    ia.analyzeGraph.mockReturnValueOnce(
      streamOf(streamEndingWith({ type: 'run_completed', progress: 100, data: FULL_SUMMARY })),
    )

    await worker.process(makeJob('job-source-health'))

    const stamped = runs.completeLatest.mock.calls.at(-1)?.[1] as {
      sourceHealth: { degraded: Array<{ source: string }>; observed: string[] }
    }
    expect(stamped.sourceHealth.degraded).toEqual([{ source: 'pappers', reason: 'quota dépassé' }])
    // `observed` is what separates "the source answered fine" from "no run
    // touched it" — both providers made calls, so both are attested.
    expect(stamped.sourceHealth.observed).toEqual(['claude', 'apollo'])
  })

  it('leaves the run history source-health null when the stream carried no summary', async () => {
    // A run cut before the terminal event knows nothing about the sources.
    // Null must read as UNKNOWN downstream — never as "all sources fine".
    ia.analyzeGraph.mockReturnValueOnce(streamOf(streamEndingWith({ type: 'run_completed', progress: 100, data: {} })))

    await worker.process(makeJob('job-no-summary'))

    const stamped = runs.completeLatest.mock.calls.at(-1)?.[1] as { sourceHealth: unknown }
    expect(stamped.sourceHealth).toBeNull()
  })

  // ── Reproducibility stamp (LOT 11, GA-311) ─────────────────────────────────
  //
  // `analysis_runs.prompt_versions` read NULL on 40/40 real runs: research
  // already computes `prompt_registry_fingerprint(profile)` and stamps it onto
  // ITS OWN telemetry (`phase1_research.py`), `builder.py` now forwards it onto
  // the terminal event's `summary.prompt_versions` — but this worker never read
  // that field and never passed it to `completeLatest`, so the column stayed
  // NULL however faithfully the IA computed it. These three tests are the
  // guard: it must READ the stamp when the terminal event carries one (not
  // fabricate one), say NO (stay null, not `{}`) when the stream carried none,
  // and not choke on / store a malformed shape (a string, an array, an old IA
  // deploy) — NULL downstream must read as "not captured", never "no prompt".
  const PROMPT_VERSIONS_SUMMARY = {
    summary: {
      ...FULL_SUMMARY.summary,
      prompt_versions: {
        model: 'claude-sonnet-5',
        prompts: { facts: 'abc123def456', signals: '112233445566' },
        phases: [{ phase: 'research', input_tokens: 13000, output_tokens: 4000 }],
      },
    },
  }

  it('stamps the run history with the prompt-versions reproducibility fingerprint', async () => {
    ia.analyzeGraph.mockReturnValueOnce(
      streamOf(streamEndingWith({ type: 'run_completed', progress: 100, data: PROMPT_VERSIONS_SUMMARY })),
    )

    await worker.process(makeJob('job-prompt-versions'))

    const stamped = runs.completeLatest.mock.calls.at(-1)?.[1] as { promptVersions: unknown }
    expect(stamped.promptVersions).toEqual(PROMPT_VERSIONS_SUMMARY.summary.prompt_versions)
  })

  it('#3235 — forwards the market memory version the plan read, and only a non-empty string', async () => {
    ia.analyzeGraph.mockReturnValueOnce(
      streamOf(
        streamEndingWith({
          type: 'run_completed',
          progress: 100,
          data: { summary: { ...FULL_SUMMARY.summary, market_memory_version: '2026-09-v3' } },
        }),
      ),
    )
    await worker.process(makeJob('job-mm-version'))
    expect((runs.completeLatest.mock.calls.at(-1)?.[1] as { marketMemoryVersion: unknown }).marketMemoryVersion).toBe(
      '2026-09-v3',
    )

    for (const malformed of ['', '  ', 42, { v: 1 }]) {
      ia.analyzeGraph.mockReturnValueOnce(
        streamOf(
          streamEndingWith({
            type: 'run_completed',
            progress: 100,
            data: { summary: { ...FULL_SUMMARY.summary, market_memory_version: malformed } },
          }),
        ),
      )
      await worker.process(makeJob(`job-mm-version-bad-${JSON.stringify(malformed)}`))
      expect(
        (runs.completeLatest.mock.calls.at(-1)?.[1] as { marketMemoryVersion: unknown }).marketMemoryVersion,
      ).toBeNull()
    }
  })

  it('leaves the run history prompt_versions null when the stream carried no summary', async () => {
    // Same shape as every one of the 40 runs read from prod before this fix —
    // must NOT become `{}` or any other fabricated stand-in for "unknown".
    ia.analyzeGraph.mockReturnValueOnce(streamOf(streamEndingWith({ type: 'run_completed', progress: 100, data: {} })))

    await worker.process(makeJob('job-prompt-versions-absent'))

    const stamped = runs.completeLatest.mock.calls.at(-1)?.[1] as { promptVersions: unknown }
    expect(stamped.promptVersions).toBeNull()
  })

  it('ignores a malformed prompt_versions payload instead of storing it', async () => {
    // A string, an array, or an empty object are not a fingerprint — the parser
    // must say NO rather than persist something that LOOKS like reproducibility
    // metadata but isn't.
    for (const malformed of ['not-an-object', ['facts', 'signals'], {}]) {
      ia.analyzeGraph.mockReturnValueOnce(
        streamOf(
          streamEndingWith({
            type: 'run_completed',
            progress: 100,
            data: { summary: { ...FULL_SUMMARY.summary, prompt_versions: malformed } },
          }),
        ),
      )

      await worker.process(makeJob(`job-prompt-versions-malformed-${JSON.stringify(malformed)}`))

      const stamped = runs.completeLatest.mock.calls.at(-1)?.[1] as { promptVersions: unknown }
      expect(stamped.promptVersions).toBeNull()
    }
  })

  it('records which sources degraded when a run dies MID-PHASE', async () => {
    // The failure path that actually fires. The worker throws on `phase_failed`
    // the instant it arrives — deliberately, so a real failure never rides the
    // BullMQ retry budget through the expensive phases — which means the
    // terminal `run_failed` below is never reached on a normal failure. While
    // `phase_failed` carried no telemetry, the source-health screen was blind on
    // every run that broke, i.e. exactly when it is the only screen that matters.
    ia.analyzeGraph.mockReturnValueOnce(
      streamOf([
        phaseCompleted('research', { research: {}, gate: { decision: 'go' } }),
        {
          type: 'phase_failed',
          phase: 'classify',
          progress: 75,
          data: { error: { code: 'CLASSIFY_TERMINAL', message: 'temperature unsupported' }, ...FULL_SUMMARY },
        },
        // Never consumed — the throw above exits the loop first. Present so the
        // test fails if the fix ever relies on reaching it.
        { type: 'run_failed', phase: 'classify', progress: 75, data: { error: { code: 'X', message: 'y' } } },
      ]),
    )

    await worker.process(makeJob('job-phase-failed-health')).catch(() => undefined)

    const stamped = runs.stampSourceHealth.mock.calls.at(-1)?.[1] as {
      degraded: Array<{ source: string; reason: string }>
      observed: string[]
    }
    expect(stamped.degraded).toEqual([{ source: 'pappers', reason: 'quota dépassé' }])
    // `observed` is what separates "answered fine" from "never called".
    expect(stamped.observed).toEqual(['claude', 'apollo'])
  })

  it('stamps NOTHING when a mid-phase failure carries no telemetry', async () => {
    // An IA deploy older than the summary-on-phase_failed change. The two
    // services deploy independently, so this frame keeps arriving for a while.
    // Absent telemetry must leave the row UNKNOWN — inventing an empty
    // breakdown would render as "all sources fine", which is the precise lie
    // #628 exists to prevent.
    ia.analyzeGraph.mockReturnValueOnce(
      streamOf([
        phaseCompleted('research', { research: {}, gate: { decision: 'go' } }),
        {
          type: 'phase_failed',
          phase: 'classify',
          progress: 75,
          data: { error: { code: 'CLASSIFY_TERMINAL', message: 'temperature unsupported' } },
        },
      ]),
    )

    await worker.process(makeJob('job-phase-failed-legacy')).catch(() => undefined)

    expect(runs.stampSourceHealth).not.toHaveBeenCalled()
  })

  it('still names the failure cause when the frame also carries telemetry', async () => {
    // Adding `summary` must not displace `data.error`: that displacement is the
    // #634 outage, where a hard Anthropic 400 reached customers as "Erreur".
    ia.analyzeGraph.mockReturnValueOnce(
      streamOf([
        phaseCompleted('research', { research: {}, gate: { decision: 'go' } }),
        {
          type: 'phase_failed',
          phase: 'classify',
          progress: 75,
          data: {
            error: { code: 'CLAUDE_BAD_REQUEST', message: "400 'temperature' is deprecated for this model" },
            ...FULL_SUMMARY,
          },
        },
      ]),
    )

    const failure = await worker.process(makeJob('job-phase-failed-cause')).then(
      () => null,
      (err: Error) => err,
    )

    expect(failure?.message).toContain("'temperature' is deprecated")
    expect(failure?.message).not.toMatch(/classify failed$/)
  })

  it('records which sources degraded even when the run FAILED', async () => {
    // An outage is exactly when runs fail. `run_failed` carries the same
    // telemetry summary as a success, but the worker used to throw on that
    // event without reading it — so the source-health screen went blind at
    // the precise moment it was needed.
    ia.analyzeGraph.mockReturnValueOnce(
      streamOf([
        phaseCompleted('research', { research: {}, gate: { decision: 'go' } }),
        {
          type: 'run_failed',
          phase: 'classify',
          progress: 75,
          data: { error: { code: 'CLAUDE_BAD_REQUEST', message: 'temperature unsupported' }, ...FULL_SUMMARY },
        },
      ]),
    )

    await worker.process(makeJob('job-failed-health')).catch(() => undefined)

    const stamped = runs.stampSourceHealth.mock.calls.at(-1)?.[1] as {
      degraded: Array<{ source: string }>
    }
    expect(stamped.degraded).toEqual([{ source: 'pappers', reason: 'quota dépassé' }])
  })

  it('keeps the accumulated cost when the IA deploy predates the field', async () => {
    // A missing key must never zero a customer's cost.
    ia.analyzeGraph.mockReturnValueOnce(
      streamOf(
        streamEndingWith({ type: 'run_completed', progress: 100, data: { summary: { total_input_tokens: 1000 } } }),
      ),
    )

    await worker.process(makeJob('job-cost-legacy'))

    expect(accountsService.setApiCost.mock.calls.at(-1)?.[1]).toBeCloseTo(1.11, 6)
    expect(accountsService.applyRunCostBreakdown).not.toHaveBeenCalled()
  })
})

describe('userFacingFailureReason', () => {
  it('translates a BullMQ stalled reason to French', () => {
    expect(userFacingFailureReason('job stalled more than allowable limit')).toContain('interrompue')
    expect(userFacingFailureReason('job stalled more than allowable limit')).not.toMatch(/stalled/i)
  })

  it('translates a timeout to French', () => {
    expect(userFacingFailureReason('Promise timed out after 1200000 ms')).toContain('temps imparti')
  })

  it('passes our own (already-French) errors through unchanged', () => {
    const own = "L'analyse de SNCF s'est interrompue avant la fin (flux SSE tronqué). Relancez l'analyse."
    expect(userFacingFailureReason(own)).toBe(own)
  })

  describe('dépassement de budget de PHASE — ne pas envoyer dans une boucle', () => {
    // Mesuré sur deux runs réels (RATP, SNCF, 10/08/2026) : un compte trop gros
    // dépasse le budget d'une phase de façon DÉTERMINISTE. Le fourre-tout
    // « timeout » répondait « Relancez-la » — cinq relances, cinq mêmes échecs.
    const raw =
      'Analysis failed in phase plan: PHASE_TIMEOUT: Phase interrompue après 260s (budget dépassé). ' +
      'Le dossier est incomplet — relancer l’analyse.'

    it('nomme la phase, en français lisible', () => {
      // « plan » seul ne dit rien à quelqu'un qui regarde une barre de progression.
      expect(userFacingFailureReason(raw)).toContain("plan d'action")
    })

    it('donne le budget dépassé', () => {
      expect(userFacingFailureReason(raw)).toContain('260')
    })

    it('n’invite PAS à relancer à l’identique, et propose le geste qui marche', () => {
      const message = userFacingFailureReason(raw)
      expect(message).toMatch(/même résultat/i)
      expect(message).toMatch(/périmètre/i)
    })

    it('reste lisible quand le message brut ne porte pas la phase', () => {
      const vague = 'PHASE_TIMEOUT: budget dépassé'
      expect(userFacingFailureReason(vague)).toContain("Une étape de l'analyse")
    })

    it('laisse le timeout GÉNÉRIQUE tel quel — lui, une relance peut le régler', () => {
      expect(userFacingFailureReason('Promise timed out after 1200000 ms')).toContain('temps imparti')
    })
  })

  describe('#4622 — une panne de source ne se montre ni en anglais ni sous le nom de notre fournisseur', () => {
    // Capture de Louis le 26/10/2026 sur /search : l'écran affichait mot pour mot
    // « Analysis failed in phase contacts: HTTPException: 500: Apollo down (search 'SANEF') ».
    const brut = "Analysis failed in phase contacts: HTTPException: 500: Apollo down (search 'SANEF')"

    it('nomme la phase en français, comme l’écran la nomme', () => {
      expect(userFacingFailureReason(brut)).toContain('identification des contacts')
    })

    it('ne laisse filtrer ni le nom du fournisseur ni le jargon technique', () => {
      const message = userFacingFailureReason(brut)
      expect(message).not.toMatch(/apollo/i)
      expect(message).not.toMatch(/HTTPException|failed in phase|500/i)
    })

    it('dit le seul geste utile, et rappelle que le cadrage survit', () => {
      const message = userFacingFailureReason(brut)
      expect(message).toMatch(/cadrage est conservé/i)
      expect(message).toMatch(/relance/i)
    })

    it('sait dire NON : un message français à nous passe toujours tel quel', () => {
      const notre = "L'analyse de SNCF s'est interrompue avant la fin (flux SSE tronqué). Relancez l'analyse."
      expect(userFacingFailureReason(notre)).toBe(notre)
    })
  })
})

describe('classifyAnalysisFailureOutcome (#2478)', () => {
  it('rend `failed` pour un échec UnrecoverableError (le graphe a rendu une réponse définitive)', () => {
    expect(classifyAnalysisFailureOutcome(new Error('graph blew up'), true)).toBe('failed')
  })

  it('rend `unknown` pour un flux SSE tronqué dont les tentatives sont épuisées — la requête est partie sans réponse', () => {
    expect(classifyAnalysisFailureOutcome(new AnalysisStreamInterruptedError('SNCF'), false)).toBe('unknown')
  })

  it('rend `unknown` pour un redémarrage worker dont les tentatives sont épuisées', () => {
    expect(classifyAnalysisFailureOutcome(new AnalysisWorkerRestartedError('SNCF'), false)).toBe('unknown')
  })

  it('délègue à dispatchFailureOutcome pour une erreur réseau brute — ETIMEDOUT (requête partie) rend `unknown`', () => {
    const err = Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' })
    expect(classifyAnalysisFailureOutcome(err, false)).toBe('unknown')
  })

  it('délègue à dispatchFailureOutcome pour une erreur réseau brute — ECONNREFUSED (jamais partie) rend `failed`', () => {
    const err = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })
    expect(classifyAnalysisFailureOutcome(err, false)).toBe('failed')
  })

  it('rend `failed` par défaut pour une erreur plate sans marqueur reconnu (comportement existant préservé)', () => {
    expect(classifyAnalysisFailureOutcome(new Error('graph blew up'), false)).toBe('failed')
  })
})
