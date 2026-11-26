import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq'
import type { AccumulatedRouteCriteria, RouteSignals } from '../account-access/route-signals'
import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DelayedError, type Job, type Queue, UnrecoverableError } from 'bullmq'
import { CorrelationIdService } from '../../correlation-id/correlation-id.service'
import type {
  AnalysisContactSeed,
  AnalysisEnrichedContact,
  AnalysisEntityQuestion,
  AnalysisPlanData,
  AnalysisResearchData,
  AnalysisScopeSelection,
  GraphPhaseCompletedData,
  LauraContextMode,
  SourceHealth,
} from '@bellum/contracts'
// #2478 — la seule question qui compte : la requête a-t-elle pu PARTIR ? Déjà
// tenue par `analysis-refresh.service.ts` (via `buildRefreshFailureReport`) pour
// le rafraîchissement ciblé d'un axe : réutilisée ici pour le run complet plutôt
// que réécrite — une dérivation vit à UN seul endroit.
import { dispatchFailureOutcome, type ChannelPerformance, type DispatchFailureOutcome } from '@bellum/contracts'
import {
  applyScopeToContactSeeds,
  applyScopeToEnrichedContacts,
  applyScopeToResearch,
  effectiveScopeSelection,
  geoPersonKey,
  graphScopeSelection,
  isOutsideGeoPerimeter,
  pruneOrgGraphPeople,
} from './analysis-scope'
import type { RunSourceHealth } from '../../database/entities/analysis-run.entity'
import { AccountsService } from '../accounts/accounts.service'
import type { SellerHypothesesForRun } from './seller-hypotheses.reader'
import { parseRunCostSummary, resolveRunCostUsd, type RunCostBreakdown } from './run-cost'
import { CreditsService } from '../credits/credits.service'
import { IaClient } from '../ia/ia.client'
import { AnalysisCancellationService, WORKER_SHUTDOWN_REASON } from './analysis-cancellation.service'
import { AnalysisCheckpointReader } from './analysis-checkpoint.reader'
import { AnalysisRunsService } from './analysis-runs.service'
import { OrgFocusWeightsService } from './org-focus-weights.service'
import { describeGraphFailure } from './graph-failure'
import { JOB_TIMEOUT_MS, MAX_PHASE_TIMEOUT_MS } from './analysis.constants'
import { LauraBatchFollowService } from './laura-batch-follow.service'
import { AnalysisEventEmitter } from './analysis-event-emitter.service'
import { AnalysisGateway } from './analysis.gateway'
import { AnalysisPersistenceService } from './analysis.persistence'
import { NotificationsService } from '../notifications/notifications.service'
import { IntegrationsService } from '../integrations/integrations.service'
import { ProductAnalyticsService } from '../analytics/product-analytics.service'
import { ProviderCostService } from '../analytics/provider-cost.service'
import { ANALYSIS_WORKER_NAME, WorkerReadinessRegistry } from '../worker-readiness/worker-readiness.registry'
import type { AnalysisAccountFact, AnalysisKnownContact } from './analysis-facts-inputs'
import {
  AnalysisAwaitingEntitySignal,
  entityQuestionFor,
  resumePlanAfterEntityPause,
  type EntityAnswerOnJob,
} from './analysis-entity-pause'
import { CRM_DEAL_LINK_PORT, type CrmDealLinkPort } from './crm-deal-link-port'
import { NeedProposalsService } from './need-proposals.service'
import { linkCrmDealsFor, recordHistoricalNeedsFor, recordNeedProposalsFor } from './research-followups'
import { CommercialBriefStep } from './commercial-brief.step'
import { DossierBlocksStep } from './dossier-blocks.step'
import { ANALYSIS_QUALIFICATION_STEP, type AnalysisQualificationStep } from './qualification-step-port'

type AnalysisJobData = {
  accountId: string
  userId: string
  companyName: string
  /**
   * #2519 / #2520 — combien de fois ce run a été remis en file après une
   * coupure d'INFRASTRUCTURE (redéploiement de l'API ou du moteur IA). Absent
   * = zéro. Voir `MAX_INFRA_REQUEUES`.
   */
  infraRequeues?: number
  // Team scope of the run — stamped on `analysis_completed` for the activity
  // journal. Optional: jobs queued before the field existed lack it.
  workspaceId?: string
  // Scope lock (Théo p.10) : SIREN de l'entité choisie — forwardé à la phase 1
  // pour ancrer Pappers dessus au lieu de re-résoudre le nom.
  siren?: string
  // Périmètre d'analyse (Théo p.10/21) : groupe/france/filiales/it_digital/…
  scopeMode?: string
  // Cadrage de la collecte confirmé AVANT le débit (Théo P0-02) : priorités +
  // exclusions d'entités/thèmes. Appliqué aux sorties de phases avant persistance
  // (`analysis-scope.ts`). Absent = dossier inchangé.
  scopeSelection?: AnalysisScopeSelection
  // Marché cible (pays) du workspace, ex. "CH" — forwardé à l'IA (param `country`)
  // pour activer le country pack. Absent = marché FR (défaut), chemin inchangé.
  country?: string
  profileData: Record<string, unknown>
  userContext?: string
  // Mémoire de corrections du compte (feedback loop A2) — directives condensées
  // côté API, forwardées à l'IA comme le profil. Absent = prompts byte-identiques.
  accountFeedback?: string
  // Mémoire du graphe d'organigramme (Annexe Organigramme §5) : version courante
  // + éléments écartés, forwardés à l'IA pour qu'elle ne les réinjecte pas.
  // Absents = assemblage byte-identique à avant la feature.
  orgGraphVersion?: number
  orgRejectedItems?: Array<{ sourceId: string; reason: string }>
  // Couche zéro (annexe méthodo p8) : relevé du CRM connecté de l'ESN sur ce
  // compte, résolu au lancement. Absent = aucun CRM connecté / aucun match →
  // requête IA byte-identique.
  crmPresence?: string
  // Couche zéro, suite (p8) : traces des AUTRES outils internes (Drive, notes,
  // e-mails, ATS). Absent = aucune intégration connectée / rien trouvé → requête
  // IA byte-identique.
  internalHistory?: string
  /** #4070.1/.2 — les faits du compte (socle #4069), datés, sans provenance, les plus
   *  pertinents d'abord. Absent = aucun fait / mode sans historique → requête IA byte-identique. */
  accountFacts?: AnalysisAccountFact[]
  /** #4070.3 — interlocuteurs déjà connus de l'espace (CRM, missions passées). */
  knownContacts?: AnalysisKnownContact[]
  /** #4070.4 — l'analyse précédente en trace datée, corrections humaines nommées. */
  previousAnalysis?: string
  /** #4070.2 — motifs de perte déclarés par l'équipe, condensés. */
  lostDealRex?: string
  /** #3753.3 — le ciblage de l'ESN sur ce compte (hypothèses du vendeur, non vérifiées). */
  sellerHypotheses?: SellerHypothesesForRun
  /** Boucle d'apprentissage (§6) — voir AnalysisService.resolveWorkspaceLearning. */
  workspaceLearning?: string
  /** #3278.3 — canaux mesurés de l'espace — voir AnalysisService.resolveChannelPerformance. */
  channelPerformance?: ChannelPerformance[]
  /** #2451.1 — le mode de contexte du dossier, posé hors « Mon activité » (AnalysisService.start). */
  contextMode?: LauraContextMode
  // Kanban commercial (annexe méthodo p6) : la colonne du compte au lancement.
  // Absente pour un compte non trié → relation « froide », requête inchangée.
  commercialStatus?: string
  // Axe CHEMIN de l'adressabilité (#1631.3/.4, #1606.2, lot 14) : le compte de
  // parcours AGRÉGÉ résolu côté API par `MarketMemoryService.pathAxisFor` +
  // l'ESN la plus observée pour nommer la preuve. Absents (aucune couverture,
  // ou sous le seuil transverse) → requête IA byte-identique, axe non mesuré.
  marketPathsObserved?: number
  marketTopEsn?: string
  // Axe RELATION (#2298.4, lot 19/09) : les quatre sources résolues côté API
  // par `AnalysisService.resolveRelationAxis` (missions, agenda, e-mails,
  // correction humaine), en plus de `crmPresence` ci-dessus. Absentes
  // (aucune source réelle) → requête IA byte-identique, axe non mesuré.
  relationMissionsCount?: number
  relationLastMeetingAt?: string
  relationLastEmailAt?: string
  relationHumanCorrection?: string
  declaredPartners?: string[]
  consultantHistory?: 'present' | 'former'
  declaredSignalPresent?: boolean
  /** #2371.4 — placements en cours sur la relation partenaire de même SIREN (10e stade). */
  partnerPlacementsActive?: number
  /** #3278.1 — veille / talent / événement / inbound (plan asynchrone). */
  routeSignals?: RouteSignals
  /** #3278.a — preuves / historique des canaux ({} = lu, rien trouvé ; absent = non lu). */
  accumulatedRouteCriteria?: AccumulatedRouteCriteria
  // Le site déjà connu du compte (tome 2 §13) : il sert à dériver le slug d'un
  // board d'offres Greenhouse/Lever sans le deviner depuis le nom. Absent sur un
  // compte neuf → requête IA byte-identique.
  website?: string
  correlationId?: string
  // Set by AnalysisService.start: true when a plan slot was claimed (false for
  // force launches). The worker refunds it on terminal failure so a failed run
  // doesn't burn a credit.
  slotConsumed?: boolean
  /** #2164.17 — la question d'identité posée quand le run s'est mis en pause
   *  (`analysis-entity-pause.ts`). Présente = le run a DÉJÀ été mis en pause une fois. */
  entityQuestion?: AnalysisEntityQuestion
  /** #2164.17 — la réponse du commercial (`AnalysisService.answerEntityQuestion`). */
  entityAnswer?: EntityAnswerOnJob
}

/** Thrown when an envelope reports ``status = 'cancelled'`` — an ack, not a failure.
 *  A dedicated type lets ``process`` tell it apart from a real error. */
class AnalysisCancelledSignal extends Error {
  readonly name = 'AnalysisCancelledSignal'
  constructor() {
    super('Analysis cancelled (envelope status)')
  }
}

/**
 * Thrown when the IA graph SSE stream ends WITHOUT a terminal event AND the
 * dossier is genuinely incomplete (a required phase never landed). This is a
 * *transient* infra cut — a mid-run Railway redeploy severing the SSE, or a
 * proxy idle-close — NOT a real analysis error.
 *
 * It is deliberately a plain (retryable) ``Error`` — NOT an ``UnrecoverableError``
 * — so BullMQ's ``attempts`` budget auto-retries it. The retry re-enters the graph
 * with ``resume: true`` (the worker derives resume from the outbox
 * ``analysis.phase_completed`` checkpoints, and the Postgres LangGraph checkpointer
 * skips the phases that already landed), so a mid-deploy cut self-heals WITHOUT
 * re-charging the analysis credit (consumed once at ``start``) or re-paying the
 * already-completed Claude phases. Only after the attempts budget is exhausted does
 * the user see the "flux SSE tronqué — relancez" banner and resume manually.
 *
 * A dedicated type keeps this transient class cleanly apart from a genuine terminal
 * failure (``run_failed`` / a persistence CHECK violation), which is thrown as an
 * ``UnrecoverableError`` so it is NEVER retry-looped through the expensive phases.
 */
export class AnalysisStreamInterruptedError extends Error {
  readonly name = 'AnalysisStreamInterruptedError'
  constructor(companyName: string) {
    super(`L'analyse de ${companyName} s'est interrompue avant la fin (flux SSE tronqué). Relancez l'analyse.`)
  }
}

/**
 * #2519 / #2520 — LA BORNE DES REMISES EN FILE APRÈS UNE COUPURE D'INFRASTRUCTURE.
 *
 * Mesuré : une fusion redéploie l'API ET le moteur IA (deux réplicas chacun).
 * Chacun peut couper un run en cours — l'API par `WORKER_SHUTDOWN_REASON`, le
 * moteur en tronquant le flux (`AnalysisStreamInterruptedError`) — et chaque
 * coupure consommait UNE des trois tentatives du job. Deux fusions rapprochées
 * (11:45 et 12:05 le 17/09/2026) suffisaient à les épuiser : le run finissait
 * « Analyse échouée » alors qu'aucune phase n'avait échoué.
 *
 * Une coupure d'infrastructure remet donc le run en file SANS consommer de
 * tentative (`job.moveToDelayed` + `DelayedError`), et la reprise saute les
 * phases déjà posées (points de contrôle de l'outbox) : rien n'est repayé, le
 * crédit du run n'est pas redébité. Quatre = deux fusions rapprochées, chacune
 * coupant l'API puis le moteur. Au-delà, c'est le budget de tentatives
 * ordinaire qui reprend — une boucle de coupures reste bornée.
 */
export const MAX_INFRA_REQUEUES = 4

/**
 * Levée quand le PROCESSUS s'arrête (redéploiement) alors qu'une analyse tourne.
 *
 * Mesuré en production le 16/08/2026 : deux fusions à trois minutes d'écart ont
 * redéployé l'API sous un run. Le conteneur est mort sans rien écrire, si bien
 * que BullMQ n'a pu reprendre le travail qu'à l'expiration de son verrou —
 * ``lockDuration`` = 10 min — pour une analyse qui en dure cinq. L'utilisateur a
 * vu dix-sept minutes là où le calcul en demandait cinq et demie.
 *
 * L'échouer TOUT DE SUITE, comme erreur ordinaire (donc rejouable), rend la
 * reprise immédiate : la tentative suivante repart sur le nouveau conteneur en
 * quelques secondes et saute, grâce aux points de contrôle de l'outbox, les
 * phases déjà posées. C'est délibérément la même famille que
 * {@link AnalysisStreamInterruptedError} : une coupure d'infrastructure, jamais
 * une erreur d'analyse.
 */
export class AnalysisWorkerRestartedError extends Error {
  readonly name = 'AnalysisWorkerRestartedError'
  constructor(companyName: string) {
    super(`L'analyse de ${companyName} a été interrompue par un redémarrage du service. Elle reprend automatiquement.`)
  }
}

/** Per-phase audit record persisted on the account so an operator can see
 *  where each analysis spent its cost/time and which sources fed each phase. */
type PhaseTelemetry = {
  name: string
  costUsd: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  durationMs: number
  sourceHealth?: Record<string, SourceHealth>
  /** Per-phase execution trace: each provider/API called, its status + result. */
  sources?: Array<{ provider: string; status: string; detail: string }>
}

/**
 * Strip NUL (\u0000) bytes from every string in a payload. Postgres jsonb/text
 * cannot store a NUL — a scraped page or PDF that contains one makes the phase
 * persist fail with ``unsupported Unicode escape sequence``, taking the whole
 * analysis down. Sanitising at the persist boundary keeps the dossier intact.
 */
export function stripNullBytes<T>(value: T): T {
  if (typeof value === 'string') return value.split(String.fromCharCode(0)).join('') as T
  if (Array.isArray(value)) return value.map(item => stripNullBytes(item)) as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = stripNullBytes(v)
    return out as T
  }
  return value
}

/** Build a ``PhaseTelemetry`` from a graph event's telemetry meta. */
function graphPhaseTelemetry(name: string, t: Record<string, unknown>): PhaseTelemetry {
  const num = (k: string): number => (typeof t[k] === 'number' ? (t[k] as number) : 0)
  return {
    name,
    costUsd: num('cost_usd'),
    inputTokens: num('input_tokens'),
    outputTokens: num('output_tokens'),
    cacheReadTokens: num('cache_read_input_tokens'),
    cacheCreationTokens: num('cache_creation_input_tokens'),
    durationMs: num('duration_ms'),
    sources: Array.isArray(t.sources)
      ? (t.sources as Array<{ provider: string; status: string; detail: string }>)
      : undefined,
  }
}

/**
 * Reproducibility stamp (LOT 11, GA-311) off the graph's terminal event —
 * ``ev.data.summary.prompt_versions``, stamped by ``builder.py``'s
 * ``_prompt_versions_stamp`` from what ``research`` already computes
 * (``prompt_registry_fingerprint`` — Théo p.15). Parsed defensively like
 * ``run-cost.ts``'s ``parseRunCostSummary`` next to it, but kept local: this
 * column is debug/repro only (no RLS on ``analysis_runs``), so the parser
 * refuses anything that is not a non-empty plain object — a malformed or
 * absent payload becomes ``null``, never a fabricated stamp. ``null`` here
 * must read downstream as "not captured", never as "no prompt used".
 */
function parsePromptVersionsStamp(data: unknown): Record<string, unknown> | null {
  if (typeof data !== 'object' || data === null) return null
  const summary = (data as { summary?: unknown }).summary
  if (typeof summary !== 'object' || summary === null) return null
  const stamp = (summary as { prompt_versions?: unknown }).prompt_versions
  if (typeof stamp !== 'object' || stamp === null || Array.isArray(stamp)) return null
  return Object.keys(stamp).length > 0 ? (stamp as Record<string, unknown>) : null
}

/**
 * #3235 (#3212.3) — la version mémoire marché que la phase `plan` a lue, off
 * ``ev.data.summary.market_memory_version`` (posée par `builder.py`
 * `summarize_telemetry`, seulement après une lecture à couverture avérée).
 * Refuse tout ce qui n'est pas une chaîne non vide : `null` = « non lue »,
 * jamais une version fabriquée.
 */
function parseMarketMemoryVersion(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null
  const summary = (data as { summary?: unknown }).summary
  if (typeof summary !== 'object' || summary === null) return null
  const version = (summary as { market_memory_version?: unknown }).market_memory_version
  return typeof version === 'string' && version.trim().length > 0 ? version.trim() : null
}

/** Per-phase WS pulses, mirroring the legacy sequential path so the front sees
 *  the identical progress timeline through the graph. ``plan`` has no
 *  completion pulse — the run finishes straight into ``analysis:done``. */
const GRAPH_PHASE_COMPLETE: Record<string, { event: string; pct: number }> = {
  research: { event: 'research_complete', pct: 40 },
  contacts: { event: 'contacts_complete', pct: 70 },
  classify: { event: 'classify_complete', pct: 85 },
}
const GRAPH_NEXT_STARTED: Record<string, { phase: string; pct: number }> = {
  research: { phase: 'contacts', pct: 45 },
  contacts: { phase: 'classify', pct: 72 },
  classify: { phase: 'plan', pct: 87 },
}

/** The four phases whose persisted outputs make a full dossier. When the SSE
 *  stream is truncated before the terminal event, the worker judges the run a
 *  success iff every one of these landed — in the outbox from a prior attempt
 *  (``ctx.completedPhases``), or during the current stream. The ``plan`` phase's
 *  ``savePlan`` has by then already flipped the account to 'completed', so failing
 *  the run would only flip a fully-produced dossier back to 'error'. */
const REQUIRED_GRAPH_PHASES = ['research', 'contacts', 'classify', 'plan'] as const

/** Read the go/no-go gate decision carried on a ``research`` ``phase_completed``
 *  event. The graph puts the gate under ``data.output.gate`` (see the IA's
 *  ``PHASE_OUTPUT_KEYS``). A ``no_go`` is a deliberate research-only early-exit —
 *  a success, not a failure — so a run whose ``run_skipped`` terminal is lost to a
 *  truncated stream must still finalise as completed, not errored. */
function graphGateIsNoGo(data: GraphPhaseCompletedData): boolean {
  const gate = (data.output.gate as { decision?: string } | undefined) ?? {}
  return gate.decision === 'no_go'
}

/** #3820 — la phase et le pourcentage du pulse ``phase:started`` initial,
 *  calculés depuis ce que ce run a DÉJÀ checkpointé plutôt que codés en dur
 *  sur ``research``. Une reprise (BullMQ retry ou le bouton « Reprendre »)
 *  annonçait toujours « research » en train de démarrer, même quand cette
 *  phase avait déjà landé sur une tentative précédente et serait sautée dans
 *  la seconde — un skip instantané lu comme une phase rejouée, à l'écran
 *  comme dans ce log. Les pourcentages de reprise reprennent ceux déjà
 *  posés par {@link GRAPH_NEXT_STARTED} pour rester le même timeline que la
 *  progression normale. */
function startingPhasePulse(completedPhases: ReadonlySet<string>): { phase: string; pct: number } {
  const idx = REQUIRED_GRAPH_PHASES.findIndex(phase => !completedPhases.has(phase))
  if (idx === -1) return { phase: 'plan', pct: GRAPH_NEXT_STARTED.classify.pct }
  if (idx === 0) return { phase: REQUIRED_GRAPH_PHASES[0], pct: 15 }
  const prior = REQUIRED_GRAPH_PHASES[idx - 1]
  return { phase: REQUIRED_GRAPH_PHASES[idx], pct: GRAPH_NEXT_STARTED[prior]?.pct ?? 15 }
}

/**
 * Identité du RUN telle que le graphe doit la voir (#1187).
 *
 * Le thread du checkpointer LangGraph vaut ``account_id:run_id`` et décide de ce
 * qui sera RE-CALCULÉ : toute phase présente dans ``completed`` est court-
 * circuitée (``nodes.py:_already_done``). On y envoyait le ``jobId``, qui est
 * DÉTERMINISTE — même utilisateur + même entreprise (+ SIREN) = même identifiant,
 * pour toujours. Deux analyses successives du même compte partageaient donc le
 * même thread, et la seconde héritait des marqueurs de la première.
 *
 * Ce n'est pas rattrapable par le drapeau ``resume``, et ``graph_analyze.py`` le
 * dit lui-même : « A durable checkpointer still restores ``completed`` from the
 * thread, so landed phases stay skipped REGARDLESS of what we pass here ». La
 * moitié API de ce défaut était déjà corrigée (``loadCompletedPhases`` est bornée
 * au run courant par ``runStartedAt``) ; la moitié IA ne l'était pas — la relance
 * repartait donc sur les points de contrôle du run précédent, ne re-collectait
 * rien, et retombait sur le même mur. C'est « bug malgré 3 relances » (#1187).
 *
 * ``analysis_runs`` porte la bonne granularité, et elle est déjà lue deux lignes
 * plus haut : une ligne par LANCEMENT (``recordStart``), aucune par reprise ni par
 * tentative BullMQ. L'horodatage de départ sépare donc exactement ce qu'il faut :
 * deux analyses distinctes obtiennent deux threads, les trois tentatives d'un même
 * run gardent le leur (et continuent de sauter ce qui a landé).
 *
 * Sans ligne de run (jobs hérités, base sans historique), on rend le ``jobId`` nu :
 * la requête reste byte-identique à avant ce correctif.
 */
function graphRunThreadId(jobId: string, runStartedAt: Date | null): string {
  const startedMs = runStartedAt?.getTime()
  return startedMs !== undefined && Number.isFinite(startedMs) ? `${jobId}:${startedMs}` : jobId
}

/** Everything ``runViaGraph`` needs from the job closure (the cost/telemetry
 *  accumulators stay owned by ``process`` so the final persist is unchanged). */
type GraphRunContext = {
  accountId: string
  userId: string
  jobId: string
  /** Identité du run pour le thread du checkpointer — voir {@link graphRunThreadId}. */
  graphRunId: string
  companyName: string
  /** Team scope of the run (activity journal) — absent on legacy queued jobs. */
  workspaceId?: string
  siren?: string
  scopeMode?: string
  /** Cadrage confirmé avant le débit — voir AnalysisJobData.scopeSelection. */
  scopeSelection?: AnalysisScopeSelection
  /** #3742 — noms (clés `geoPersonKey`) des personnes écartées par le périmètre
   *  géographique dans la phase contacts de CE run ; l'organigramme les retire. */
  geoDroppedNames?: Set<string>
  country?: string
  profileData: Record<string, unknown>
  userContext: unknown
  accountFeedback?: string
  orgGraphVersion?: number
  orgRejectedItems?: Array<{ sourceId: string; reason: string }>
  /** Couche zéro (annexe méthodo p8) — voir AnalysisJobData.crmPresence. */
  crmPresence?: string
  /** Couche zéro, hors CRM (p8) — voir AnalysisJobData.internalHistory. */
  internalHistory?: string
  /** #4070 — voir AnalysisJobData.accountFacts / knownContacts / previousAnalysis / lostDealRex. */
  accountFacts?: AnalysisAccountFact[]
  knownContacts?: AnalysisKnownContact[]
  previousAnalysis?: string
  lostDealRex?: string
  /** #3753.3 — voir AnalysisJobData.sellerHypotheses. */
  sellerHypotheses?: SellerHypothesesForRun
  /** Boucle d'apprentissage (§6) — voir AnalysisJobData.workspaceLearning. */
  workspaceLearning?: string
  /** #3278.3 — voir AnalysisJobData.channelPerformance. */
  channelPerformance?: ChannelPerformance[]
  /** #2451.1 — le mode de contexte du dossier — voir AnalysisJobData.contextMode. */
  contextMode?: LauraContextMode
  /** Kanban commercial (annexe méthodo p6) — voir AnalysisJobData.commercialStatus. */
  commercialStatus?: string
  /** Axe CHEMIN (lot 14) — voir AnalysisJobData.marketPathsObserved / marketTopEsn. */
  marketPathsObserved?: number
  marketTopEsn?: string
  /** Axe RELATION (#2298.4) — voir AnalysisJobData.relationMissionsCount / … */
  relationMissionsCount?: number
  relationLastMeetingAt?: string
  relationLastEmailAt?: string
  relationHumanCorrection?: string
  declaredPartners?: string[]
  consultantHistory?: 'present' | 'former'
  declaredSignalPresent?: boolean
  /** #2371.4 — placements en cours sur la relation partenaire de même SIREN (10e stade). */
  partnerPlacementsActive?: number
  /** #3278.1 — veille / talent / événement / inbound (plan asynchrone). */
  routeSignals?: RouteSignals
  /** #3278.a — preuves / historique des canaux ({} = lu, rien trouvé ; absent = non lu). */
  accumulatedRouteCriteria?: AccumulatedRouteCriteria
  /** Site connu du compte (tome 2 §13) — voir AnalysisJobData.website. */
  website?: string
  cid: string
  startedAt: number
  jobTimeout: AbortSignal
  completedPhases: Set<string>
  /** #2164.17 — vrai tant que ce run peut encore se mettre en pause sur une
   *  identité ambiguë (run lancé par NOM, jamais encore mis en pause). */
  entityPauseAllowed: boolean
  phaseCtx: { jobId: string; correlationId: string }
  addCost: (costUsd: number) => void
  /** Replace the accumulated per-phase figure with the run's authoritative
   *  total. Only the terminal event knows the full cost (LLM + paid providers);
   *  everything before it has only seen token cost. */
  setCost: (costUsd: number) => void
  /** Accumulated LLM cost so far — stamped on the run history at completion. */
  readCost: () => number
  pushTelemetry: (t: PhaseTelemetry) => void
  flushTelemetry: () => Promise<void>
}

/** Dead-letter queue payload written on terminal failure. Kept flat + JSON-friendly for Redis. */
type DlqPayload = {
  originalJobId: string
  payload: AnalysisJobData
  failedReason: string
  unrecoverable: boolean
  /** #2478 — `failed` (réponse définitive) ou `unknown` (requête partie sans
   *  réponse) : conservé pour le tri opérateur, indépendamment du fait qu'un
   *  `unknown` n'ait écrit ni statut ni remboursement (voir `onFailed`). */
  outcome: DispatchFailureOutcome
  attemptsMade: number
  maxAttempts: number
  correlationId: string | null
  failedAt: string
}

// Per-phase network budgets + the hard job ceiling (JOB_TIMEOUT_MS) live in
// analysis.constants so the on-demand single-phase runs and the stuck-analysis
// reaper share the same source of truth as the worker lock sizing. The worker
// consumes JOB_TIMEOUT_MS internally (job abort budget); only MAX_PHASE_TIMEOUT_MS
// is re-exported (the worker spec asserts the lock clears it).
export { MAX_PHASE_TIMEOUT_MS }

/**
 * Full-jitter exponential backoff (AWS best practice, avoids thundering herd on retries).
 * `attemptsMade` here is BullMQ's counter after failure: 1 after 1st fail, 2 after 2nd, ...
 * Delay window = [base/2, base] with base = 5s * 2^(attemptsMade-1), capped at 60s.
 */
function exponentialJitterBackoff(attemptsMade: number): number {
  const base = 5000 * 2 ** Math.max(0, attemptsMade - 1)
  const capped = Math.min(base, 60_000)
  return Math.round(capped * (0.5 + Math.random() * 0.5))
}

/**
 * Map an opaque infra/BullMQ failure reason to a clear French message for the
 * user. The raw English string still goes to logs/Sentry/DLQ/domain events; only
 * what the commercial sees (account status + WS error) is translated. Our own
 * thrown errors are already user-ready French, so they pass through unchanged.
 */
export function userFacingFailureReason(raw: string): string {
  const msg = (raw || '').toLowerCase()
  // BullMQ marks a job "stalled" when the worker's lock lapses (redeploy,
  // event-loop block, Redis hiccup): "job stalled more than allowable limit".
  if (msg.includes('stalled')) {
    return "L'analyse a été interrompue (le worker n'a pas répondu à temps). Relancez-la."
  }
  // Un dépassement de budget de PHASE n'est pas un aléa : sur un compte trop
  // gros il se reproduira à l'identique. Le fourre-tout « timeout » ci-dessous
  // l'écrasait pourtant en « Relancez-la » — un conseil qui envoie l'utilisateur
  // dans une boucle qui ne peut pas aboutir. Mesuré sur deux runs réels (RATP,
  // SNCF, 10/08/2026) : cinq relances, cinq mêmes échecs.
  //
  // Le graphe produit déjà un message précis et en français ; on le garde, on
  // nomme la phase, et on propose le seul geste qui change quelque chose —
  // réduire le périmètre analysé.
  const phaseTimeout = /failed in phase (\w+): PHASE_TIMEOUT: [^(]*\((?:budget[^)]*)\)?/i.exec(raw || '')
  if (msg.includes('phase_timeout')) {
    const phase = phaseTimeout?.[1] ?? /failed in phase (\w+)/i.exec(raw || '')?.[1]
    const seconds = /après\s+(\d+)\s*s/i.exec(raw || '')?.[1]
    const where = phase ? `L'étape « ${PHASE_LABELS_FR[phase] ?? phase} »` : "Une étape de l'analyse"
    const budget = seconds ? ` (budget : ${seconds} s)` : ''
    return (
      `${where} a dépassé son temps de calcul${budget}. Sur un compte de cette taille, relancer ` +
      `à l'identique donnera le même résultat : restreins le périmètre d'analyse (une entité plutôt ` +
      `que le groupe entier) ou signale-le au support.`
    )
  }
  if (msg.includes('timed out') || msg.includes('timeout')) {
    return "L'analyse a dépassé le temps imparti. Relancez-la."
  }
  // #4622 (« l'audit à fail », Louis 26/10/2026) — le dernier recours rendait le BRUT, et
  // « Analysis failed in phase contacts: HTTPException: 500: Apollo down (search 'SANEF') »
  // s'affichait TEL QUEL au commercial. Deux règles du dépôt tombaient dans la même ligne :
  // aucune chaîne dans une seule langue, et NOS fournisseurs ne se nomment jamais (on nomme
  // ce que l'espace a branché, jamais ce qui nous sert). Seul l'emballage technique du graphe
  // est traduit ici : nos propres messages, déjà en français, continuent de passer tels quels.
  const phase = /failed in phase (\w+)/i.exec(raw || '')?.[1]
  if (phase) {
    const where = PHASE_LABELS_FR[phase] ?? phase
    return (
      `L'étape « ${where} » n'a pas abouti, et le dossier n'a donc pas pu être produit en entier. ` +
      `Le cadrage est conservé : relance l'analyse, et signale-le au support si elle échoue encore.`
    )
  }
  return raw
}

/** Les phases, nommées comme l'écran les nomme — « plan » seul ne dit rien à
 *  quelqu'un qui regarde une barre de progression. */
const PHASE_LABELS_FR: Readonly<Record<string, string>> = {
  research: 'recherche',
  contacts: 'identification des contacts',
  classify: 'classification des contacts',
  plan: "plan d'action",
}

/**
 * #2478 — « les analyses échouent presque à chaque fois et en plus c'est
 * faux, une grande partie a fonctionné ». `onFailed` basculait TOUT compte à
 * `error` dès que BullMQ épuisait ses tentatives, sans jamais distinguer un
 * échec RÉEL d'une requête simplement partie sans réponse.
 *
 * La seule question qui tranche (CLAUDE.md, « Un timeout n'est pas un
 * échec ») : la requête a-t-elle pu PARTIR ?
 *  - `unrecoverable` (le graphe a lui-même rendu `phase_failed` / `run_failed`,
 *    ou une écriture a violé une contrainte — voir `persistenceError` et le
 *    `throw new UnrecoverableError` du cas `run_failed` ci-dessous) : une
 *    réponse DÉFINITIVE est arrivée → `failed`.
 *  - `AnalysisStreamInterruptedError` / `AnalysisWorkerRestartedError` :
 *    ces deux classes existent PRÉCISÉMENT pour une coupure d'infra en plein
 *    flux (leurs docstrings l'expliquent) — les tentatives sont épuisées
 *    sans qu'aucune réponse n'ait jamais été observée pour les phases
 *    manquantes → `unknown`. Leur message ne porte aucun marqueur réseau
 *    (« flux SSE tronqué », « redémarrage du service »), donc
 *    `dispatchFailureOutcome` les rendrait `failed` par défaut — d'où le
 *    court-circuit explicite ici.
 *  - tout le reste (une erreur réseau brute qui a fini par épuiser ses
 *    tentatives, ex. un `IaClient` qui timeout mid-flight) : tranché par
 *    `dispatchFailureOutcome`, la RÉUTILISATION de la même règle déjà tenue
 *    par `analysis-refresh.service.ts` — pas une réécriture.
 */
export function classifyAnalysisFailureOutcome(error: Error, unrecoverable: boolean): DispatchFailureOutcome {
  if (unrecoverable) return 'failed'
  if (error?.name === 'AnalysisStreamInterruptedError' || error?.name === 'AnalysisWorkerRestartedError') {
    return 'unknown'
  }
  return dispatchFailureOutcome(error)
}

/**
 * BullMQ worker options.
 *
 * ``lockDuration`` (how long a job's lock stays valid without renewal) must
 * exceed the longest single phase. The worker auto-renews the lock every
 * ``lockDuration / 2`` while alive, but a transient event-loop block — e.g.
 * assembling the ~500k-char Phase-1 prompt — can delay a renewal. If the lock
 * lapses mid-phase the job is marked *stalled*, and with ``maxStalledCount: 1``
 * a single false stall FAILS a still-progressing analysis. Locking past the
 * longest phase (+ headroom) closes that race; on a real worker crash the job
 * is still reclaimed once the lock finally expires.
 *
 * Graceful shutdown (draining in-flight jobs) is NOT done here — @nestjs/bullmq
 * closes workers via ``onApplicationShutdown`` → ``worker.close()``, which only
 * fires because ``main.ts`` calls ``app.enableShutdownHooks()``.
 */
export const ANALYSIS_WORKER_OPTIONS = {
  stalledInterval: 30_000,
  maxStalledCount: 1,
  // Multiple analyses can run in parallel — each phase fans out to Brave +
  // Firecrawl + Pappers + Claude + Apollo, none of which we'd want to ramp
  // beyond a handful concurrently (third-party quotas + Anthropic billing).
  // 3 is a conservative budget that lets the user kick off a small batch
  // without burning the hourly cap or blowing up tail latency.
  concurrency: 3,
  // Lock must outlast the longest phase (research, 480s) + 2 min headroom so a
  // slow-but-alive phase is never falsely stalled.
  lockDuration: MAX_PHASE_TIMEOUT_MS + 120_000,
  // BullMQ ships `exponential` and `fixed` built-in but no jitter variant, so we register one here.
  // The name must match the `type` used in `analysisQueue.add({ backoff: { type: ... } })`.
  settings: {
    backoffStrategy: (attemptsMade: number, type?: string) => {
      if (type === 'exponential-jitter') return exponentialJitterBackoff(attemptsMade)
      return 0
    },
  },
}

@Processor('analysis', ANALYSIS_WORKER_OPTIONS)
@Injectable()
export class AnalysisWorker extends WorkerHost {
  private readonly logger = new Logger(AnalysisWorker.name)

  constructor(
    private readonly gateway: AnalysisGateway,
    private readonly accounts: AccountsService,
    private readonly correlationIdService: CorrelationIdService,
    private readonly ia: IaClient,
    @InjectQueue('analysis-dlq') private readonly dlq: Queue<DlqPayload>,
    private readonly persistence: AnalysisPersistenceService,
    private readonly config: ConfigService,
    private readonly cancellation: AnalysisCancellationService,
    private readonly events: AnalysisEventEmitter,
    private readonly checkpoints: AnalysisCheckpointReader,
    private readonly notifications: NotificationsService,
    private readonly integrations: IntegrationsService,
    private readonly credits: CreditsService,
    private readonly runs: AnalysisRunsService,
    // Product analytics — best-effort, `@Optional()` so the worker spec (which
    // constructs it directly) needs no analytics stub.
    @Optional() private readonly analytics?: ProductAnalyticsService,
    // Coûts fournisseurs par run (D19) — `@Optional()` pour la même raison, et
    // parce qu'une métrique ne doit jamais empêcher une analyse de tourner.
    @Optional() private readonly providerCosts?: ProviderCostService,
    // Deploy readiness gate — `@Optional()` for the same reason. When present,
    // this worker reports its liveness so `/health/ready` can gate promotion on
    // the in-process worker actually running.
    @Optional() private readonly readiness?: WorkerReadinessRegistry,
    // Le focus du plan, réglé par espace. `@Optional()` comme les autres
    // dépendances non essentielles : sans lui, le run applique les valeurs EN
    // VIGUEUR du contrat — le comportement documenté, jamais une valeur
    // inventée — et le module reste retirable (craft rule 7).
    @Optional() private readonly orgFocusWeights?: OrgFocusWeightsService,
    // Propositions de besoins (PDF 4, PE5) — `@Optional()` comme les autres :
    // une suggestion qui échoue ne doit jamais faire tomber une analyse
    // terminée. Le dossier vaut infiniment plus que ce qui l'accompagne.
    @Optional() private readonly needProposals?: NeedProposalsService,
    // Chantier « briefs comptes » (01/10/2026) — l'étape 5 : le brief
    // commercial. `@Optional()` comme les propositions de besoins juste
    // au-dessus : un brief qui échoue ne fait jamais tomber un dossier livré.
    @Optional() private readonly commercialBrief?: CommercialBriefStep,
    // #3755 — la grille de qualification de l'espace. `@Optional()` : sans
    // elle (ou sans grille active), le verdict reste celui d'avant.
    @Optional() @Inject(ANALYSIS_QUALIFICATION_STEP) private readonly qualification?: AnalysisQualificationStep,
    // #4078 — les cinq blocs du dossier complet (parité démo). `@Optional()` :
    // sans elle, le brief part seul, comme avant.
    @Optional() private readonly dossierBlocks?: DossierBlocksStep,
    // #4462.9 — la fin d'un lot d'analyses lancé par Laura (classement « par où commencer »). `@Optional()` :
    // sans lui, le run se termine comme avant.
    @Optional() private readonly batchFollow?: LauraBatchFollowService,
    // Lot 762 P5 — rattachement des deals CRM aux comptes à l'analyse (comme à l'actualisation). `@Optional()`.
    @Optional() @Inject(CRM_DEAL_LINK_PORT) private readonly crmRead?: CrmDealLinkPort,
  ) {
    super()
    // Report this worker's liveness to the `/health/ready` deploy gate. The probe
    // reads `this.worker` LAZILY: @nestjs/bullmq builds the underlying BullMQ
    // Worker during Nest bootstrap, AFTER this constructor runs, so evaluating it
    // now would always be undefined — `worker.isRunning()` is only truthy once the
    // worker's run loop is actually going.
    this.readiness?.register(ANALYSIS_WORKER_NAME, () => this.worker?.isRunning() ?? false)
  }

  /**
   * Run one analysis through the LangGraph engine (apps/ia) — see ``runViaGraph``.
   *
   * Error handling lives entirely in `@OnWorkerEvent('failed')` — throwing here lets BullMQ run its
   * retry logic with our custom backoff. We intentionally do NOT catch/handle errors inline because
   * an intermediate failure must not write `accounts.status = 'error'` or emit `analysis:error` —
   * those are terminal-only signals.
   */
  async process(job: Job<AnalysisJobData>, token?: string): Promise<void> {
    const {
      accountId,
      userId,
      companyName,
      workspaceId,
      siren,
      scopeMode,
      scopeSelection,
      country,
      profileData,
      userContext,
      accountFeedback,
      orgGraphVersion,
      orgRejectedItems,
      crmPresence,
      internalHistory,
      accountFacts,
      knownContacts,
      previousAnalysis,
      lostDealRex,
      sellerHypotheses,
      workspaceLearning,
      channelPerformance,
      contextMode,
      commercialStatus,
      marketPathsObserved,
      marketTopEsn,
      relationMissionsCount,
      relationLastMeetingAt,
      relationLastEmailAt,
      relationHumanCorrection,
      declaredPartners,
      consultantHistory,
      declaredSignalPresent,
      partnerPlacementsActive,
      routeSignals,
      accumulatedRouteCriteria,
      website,
      correlationId,
    } = job.data
    const jobId = job.id ?? accountId
    const cid = correlationId ?? ''
    // BullMQ v5: `attemptsStarted` is incremented BEFORE processing (1 on first run, 2 on first retry).
    // #2519 — une remise en file après une coupure d'infrastructure est aussi un
    // démarrage, mais pas une tentative : elle ne se compte pas.
    const attempt = Math.max(1, (job.attemptsStarted || 1) - (job.data.infraRequeues ?? 0))
    const maxAttempts = job.opts.attempts ?? 1

    if (attempt > 1) {
      this.logger.log('Analysis retry', { jobId, attempt, maxAttempts, companyName })
      this.gateway.emitAnalysisRetry(accountId, jobId, attempt, maxAttempts)
    }

    // Combine the per-job timeout with the user-cancel signal from
    // AnalysisCancellationService. Whichever fires first aborts every IA
    // call still in flight.
    const cancelSignal = this.cancellation.register(jobId)
    const jobTimeout = AbortSignal.any([AbortSignal.timeout(JOB_TIMEOUT_MS), cancelSignal])
    const startedAt = Date.now()

    const pipeline = this.correlationIdService.runWithContext({ correlationId: cid, userId }, async () => {
      await this.events.started({ jobId, accountId, userId, companyName, correlationId: cid })

      // Resume support — read which phases the previous attempt(s) already
      // checkpointed via ``analysis.phase_completed`` events in the outbox.
      // That table is the **single source of truth** for resume: persistence
      // writes the data + the event in one TX, so an event exists iff its
      // data write committed. This drives BOTH a BullMQ auto-retry (a transient
      // stream cut re-runs the SAME job — see ``AnalysisStreamInterruptedError``)
      // AND a user-triggered resume from the error banner: either way the graph
      // skips the landed phases instead of re-paying them.
      //
      // Borné au run COURANT (`analysis_runs`) : le `jobId` est déterministe,
      // donc une RELANCE d'une entreprise déjà analysée retombait sur les
      // points de contrôle du run précédent, en déduisait `resume: true` et
      // sautait recherche + contacts + classification. L'« actualisation »
      // ne re-collectait alors rien — elle ne rejouait que le plan, sur des
      // données périmées, en débitant son crédit.
      const runStartedAt = await this.runs.latestStartedAt(accountId)
      // #2164.17 — la reprise après une pause d'identité. Réponse = une AUTRE
      // entité : la recherche faite sur l'hypothèse ne vaut plus rien, le run
      // repart à neuf (aucune phase sautée, thread du checkpointer distinct),
      // verrouillé sur le SIREN choisi. Sinon : reprise ordinaire.
      const entityPlan = resumePlanAfterEntityPause(job.data.entityQuestion, job.data.entityAnswer)
      const runSiren = siren ?? entityPlan.siren ?? undefined
      const completedPhases = entityPlan.freshResearch
        ? new Set<string>()
        : await this.checkpoints.loadCompletedPhases(accountId, jobId, runStartedAt)
      const baseGraphRunId = graphRunThreadId(jobId, runStartedAt)
      const phaseCtx = { jobId, correlationId: cid }

      // B1 telemetry: accumulate each phase's LLM cost (from its envelope
      // meta.token_usage) and persist the total on completion. Resume skips
      // already-checkpointed phases, so the figure covers the phases actually
      // run this attempt — a monitoring approximation, not a billing ledger.
      let apiCostUsd = 0
      const phaseTelemetry: PhaseTelemetry[] = []

      // Persist the running cost + per-phase audit as each phase commits, not
      // only at the very end. A run that later dies in a downstream phase (e.g.
      // Phase 4 plan fails on an Anthropic billing error) used to lose ALL
      // telemetry — the monitoring then showed $0 cost and no per-phase
      // breakdown for the phases that actually succeeded. Both writes overwrite
      // (last-write-wins with the full array), so calling this after every
      // phase is idempotent. Best-effort: never fail a phase on a telemetry
      // write. ``completedPhases.size === 0`` guards resume from clobbering a
      // prior full audit with this attempt's partial one.
      const flushTelemetry = async (): Promise<void> => {
        try {
          await this.accounts.setApiCost(accountId, apiCostUsd)
          if (completedPhases.size === 0) {
            await this.accounts.applyPhaseTelemetry(accountId, phaseTelemetry)
          }
        } catch (err) {
          this.logger.warn('Failed to persist api cost / phase telemetry (non-fatal)', {
            jobId,
            accountId,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }

      // Single orchestrator: the LangGraph engine (apps/ia) runs all four
      // phases and streams typed events back; this worker is the durable shell
      // that persists each phase's output + relays the WS pulses. Resume,
      // gateway timeline, cost/telemetry and finalisation all happen inside
      // ``runViaGraph`` — see its body for the per-event mapping.
      await this.runViaGraph({
        accountId,
        userId,
        jobId,
        graphRunId: entityPlan.freshResearch ? `${baseGraphRunId}:siren-${runSiren}` : baseGraphRunId,
        companyName,
        workspaceId,
        siren: runSiren,
        scopeMode,
        // #3742 — la puce « France » filtre les personnes comme le champ géographique.
        scopeSelection: effectiveScopeSelection(scopeMode, scopeSelection),
        country,
        profileData,
        userContext,
        accountFeedback,
        orgGraphVersion,
        orgRejectedItems,
        crmPresence,
        internalHistory,
        accountFacts,
        knownContacts,
        previousAnalysis,
        lostDealRex,
        sellerHypotheses,
        workspaceLearning,
        channelPerformance,
        contextMode,
        commercialStatus,
        marketPathsObserved,
        marketTopEsn,
        relationMissionsCount,
        relationLastMeetingAt,
        relationLastEmailAt,
        relationHumanCorrection,
        declaredPartners,
        consultantHistory,
        declaredSignalPresent,
        partnerPlacementsActive,
        routeSignals,
        accumulatedRouteCriteria,
        website,
        cid,
        startedAt,
        jobTimeout,
        completedPhases,
        // Un run au SIREN verrouillé n'a pas d'homonyme à trancher.
        entityPauseAllowed: entityPlan.pauseAllowed && !siren,
        phaseCtx,
        addCost: costUsd => {
          apiCostUsd += costUsd
        },
        setCost: costUsd => {
          apiCostUsd = costUsd
        },
        readCost: () => apiCostUsd,
        pushTelemetry: t => phaseTelemetry.push(t),
        flushTelemetry,
      })
    })

    try {
      await pipeline
    } catch (err) {
      // A user cancellation aborts the in-flight IA stream, which surfaces here
      // as an AbortError — NOT an AnalysisCancelledSignal (that envelope status
      // never reaches the graph path). Treat any error while the user-cancel
      // signal is aborted as an ack: stop quietly so `onFailed` never runs (no
      // markErrored, no red toast, no DLQ). `cancelByUser` already flipped the
      // account to 'canceled'. A plain job-timeout abort leaves `cancelSignal`
      // un-aborted, so it still bubbles up as a real failure.
      // Le service s'arrête (redéploiement) : ce n'est NI une annulation NI une
      // erreur d'analyse. Testé AVANT la branche d'annulation, qui rendrait la
      // main en silence — le run serait alors perdu au lieu d'être repris.
      if (cancelSignal.reason === WORKER_SHUTDOWN_REASON) {
        this.logger.warn('Analyse interrompue par un redémarrage du service — remise en file', { jobId, companyName })
        this.cancellation.unregister(jobId)
        throw await this.requeueAfterInfraCut(job, token, new AnalysisWorkerRestartedError(companyName))
      }
      // #2164.17 — la recherche a rendu deux homonymes : le run se met en pause
      // avec sa question. Ce n'est ni une annulation ni une erreur.
      if (err instanceof AnalysisAwaitingEntitySignal && !cancelSignal.aborted) {
        this.cancellation.unregister(jobId)
        throw await this.pauseForEntity(job, token, err)
      }
      if (err instanceof AnalysisCancelledSignal || cancelSignal.aborted) {
        this.logger.log('Analysis cancelled', { jobId, companyName })
        this.cancellation.unregister(jobId)
        return
      }
      // #2519 — le moteur IA redéployé a coupé le flux : même porte que ci-dessus.
      if (err instanceof AnalysisStreamInterruptedError) throw await this.requeueAfterInfraCut(job, token, err)
      throw err
    }
  }

  /**
   * #2164.17 — MET LE RUN EN PAUSE sur une identité ambiguë : la question est
   * rangée dans les données du job, le job est différé jusqu'à son échéance
   * (`expiresAt`). Une réponse le PROMEUT plus tôt (`AnalysisService.answerEntityQuestion`) ;
   * sans réponse, il reprend seul sur l'hypothèse. Comme la remise en file
   * d'infrastructure, `DelayedError` ne consomme aucune tentative. Redis refuse ⇒
   * l'erreur rejouable ordinaire : le run n'est jamais perdu.
   */
  private async pauseForEntity(
    job: Job<AnalysisJobData>,
    token: string | undefined,
    signal: AnalysisAwaitingEntitySignal,
  ): Promise<Error> {
    try {
      await job.updateData({ ...job.data, entityQuestion: signal.question })
      await job.moveToDelayed(Date.parse(signal.question.expiresAt), token)
    } catch (error) {
      this.logger.warn('Pause d’identité impossible — budget de tentatives ordinaire', {
        jobId: job.id,
        error: error instanceof Error ? error.message : String(error),
      })
      return new AnalysisStreamInterruptedError(job.data.companyName)
    }
    this.logger.log('Analyse en pause — identité ambiguë, question posée', {
      jobId: job.id,
      candidates: signal.question.candidates.length,
    })
    return new DelayedError()
  }

  /**
   * #2519 / #2520 — remet le run en file après une coupure d'INFRASTRUCTURE,
   * sans consommer de tentative. Rend l'erreur à lever : `DelayedError` quand la
   * remise en file a eu lieu (BullMQ ne compte alors aucun échec), sinon
   * `cause` — l'erreur rejouable ordinaire, qui roule sur le budget de
   * tentatives. C'est aussi le repli quand Redis refuse le déplacement : on ne
   * perd jamais le run, on retombe sur le chemin d'avant.
   */
  private async requeueAfterInfraCut(
    job: Job<AnalysisJobData>,
    token: string | undefined,
    cause: Error,
  ): Promise<Error> {
    const requeues = job.data.infraRequeues ?? 0
    if (requeues >= MAX_INFRA_REQUEUES) return cause
    try {
      await job.updateData({ ...job.data, infraRequeues: requeues + 1 })
      await job.moveToDelayed(Date.now() + exponentialJitterBackoff(requeues + 1), token)
    } catch (error) {
      this.logger.warn('Remise en file impossible après une coupure — budget de tentatives ordinaire', {
        jobId: job.id,
        error: error instanceof Error ? error.message : String(error),
      })
      return cause
    }
    this.logger.warn('Coupure d’infrastructure — run remis en file sans consommer de tentative', {
      jobId: job.id,
      infraRequeues: requeues + 1,
      cause: cause.name,
    })
    return new DelayedError()
  }

  /**
   * Drive one analysis through the LangGraph engine (apps/ia): POST once,
   * consume the SSE event stream, and persist + relay each phase as it lands.
   * Parity with the legacy sequential path — same persistence writes, same WS
   * pulse timeline, same cost/telemetry accumulation, same finalisation.
   */
  private async runViaGraph(ctx: GraphRunContext): Promise<void> {
    const { accountId, userId, jobId } = ctx
    // #3820 — annonce la phase RÉELLEMENT en train de démarrer. Un pulse codé
    // en dur sur ``research`` mentait sur une reprise : cette phase pouvait
    // déjà avoir landé sur une tentative précédente (lue via
    // ``ctx.completedPhases``) et serait sautée dans la seconde — une
    // réannonce qui se lisait comme une phase rejouée, à l'écran comme dans ce
    // log, alors que le graphe la sautait correctement.
    const { phase: startingPhase, pct: startingPct } = startingPhasePulse(ctx.completedPhases)
    this.logger.log('Analysis phase starting', {
      jobId,
      phase: startingPhase,
      companyName: ctx.companyName,
      resumed: ctx.completedPhases.size > 0,
    })
    // #2164.4 — LA RÉUTILISATION, NOMMÉE. Émise AVANT la 1re phase (elle passe en
    // premier à l'écran, `ANALYSIS_STEP_ORDER`) et seulement quand ce run reçoit
    // réellement des données déjà connues du compte ; rien à réutiliser ou run
    // repris ⇒ aucune étape, jamais « faite » par défaut.
    if (
      ctx.completedPhases.size === 0 &&
      (Boolean(ctx.previousAnalysis?.trim()) ||
        (ctx.accountFacts?.length ?? 0) > 0 ||
        (ctx.knownContacts?.length ?? 0) > 0)
    ) {
      this.gateway.emitPhaseStarted(accountId, jobId, 'reuse_existing', 2)
    }
    this.gateway.emitPhaseStarted(accountId, jobId, startingPhase, startingPct)

    // #2164.17 — coupe le flux du graphe quand le run se met en pause : le moteur
    // IA n'enchaîne pas les contacts sur une identité encore en question.
    const entityPause = new AbortController()
    const events = this.ia.analyzeGraph(
      {
        companyName: ctx.companyName,
        siren: ctx.siren,
        scopeMode: ctx.scopeMode,
        // #3288 — seul le PALIER choisi part au graphe (il règle les pages lues
        // côté IA) ; le reste du cadrage garde son chemin d'avant. Sans palier,
        // clé absente : corps du graphe byte-identique.
        // #3742 — la zone géographique (puce « France » comprise) part aussi :
        // l'assembleur d'organigramme filtre le chemin recommandé avec elle.
        scopeSelection: graphScopeSelection(ctx.scopeSelection),
        // Non-FR market → activates the matching country pack on the IA side.
        country: ctx.country,
        // Le site déjà connu du compte : il sert à dériver le slug d'un board
        // d'offres (Greenhouse, Lever). Inconnu sur un compte neuf ⇒ omis.
        website: ctx.website,
        profileData: ctx.profileData,
        userContext: ctx.userContext,
        // Mémoire de corrections (A2) — omise du wire quand vide (IaClient).
        accountFeedback: ctx.accountFeedback,
        // Mémoire du graphe d'organigramme (Annexe Organigramme §5) — version +
        // rejets, omis du wire quand il n'y a rien à se rappeler (IaClient).
        orgGraphVersion: ctx.orgGraphVersion,
        orgRejectedItems: ctx.orgRejectedItems,
        // Couche zéro (annexe méthodo p8) : « chercher ce qui existe avant de
        // proposer du froid ». Omise du wire quand vide (IaClient) → sans CRM
        // connecté, la requête du graphe est byte-identique.
        crmPresence: ctx.crmPresence,
        // Couche zéro, suite (p8) : Drive, notes, e-mails, ATS. Omise du wire
        // quand vide → sans intégration connectée, requête byte-identique.
        internalHistory: ctx.internalHistory,
        // #4070 — les faits du compte, les interlocuteurs connus, l'analyse précédente et les
        // motifs de perte : omis du wire quand vides (IaClient) → run byte-identique.
        accountFacts: ctx.accountFacts,
        knownContacts: ctx.knownContacts,
        previousAnalysis: ctx.previousAnalysis,
        lostDealRex: ctx.lostDealRex,
        // #3753.3 — le ciblage de l'ESN : omis du wire quand absent (IaClient).
        sellerHypotheses: ctx.sellerHypotheses,
        // Boucle d'apprentissage (§6) : ce que l'ÉQUIPE a fait des besoins
        // passés. Omise du wire quand vide → une équipe qui débute lance un run
        // byte-identique à avant la feature.
        workspaceLearning: ctx.workspaceLearning,
        // #3278.3 — canaux mesurés : omis du wire quand l'espace n'a rien mesuré.
        channelPerformance: ctx.channelPerformance,
        // #2451.1 — le mode de contexte du dossier. Absent en « Mon activité »
        // (l'API ne le pose pas) → clé omise du wire (IaClient), byte-identique.
        contextMode: ctx.contextMode,
        // Le FOCUS du plan, réglé par l'ESPACE (« jamais un prisme IT par
        // défaut »). Résolu ICI plutôt que porté par la charge du job : un
        // réglage lu au moment du run décrit l'espace tel qu'il est, pas tel
        // qu'il était quand quelqu'un a cliqué. Omis du wire quand rien n'est
        // réglé (IaClient) → run byte-identique.
        focusWeights: (await this.orgFocusWeights?.overridesFor(ctx.workspaceId)) ?? {},
        // Relation réelle (annexe méthodo p6) : la colonne kanban du compte.
        // Omise du wire pour un compte non trié (IaClient) → run inchangé.
        commercialStatus: ctx.commercialStatus,
        // Axe CHEMIN (#1631.3/.4, lot 14) — résolu côté API par
        // `MarketMemoryService.pathAxisFor` avant l'enqueue. Omis du wire sans
        // couverture (IaClient) → run byte-identique, axe non mesuré côté IA.
        marketPathsObserved: ctx.marketPathsObserved,
        marketTopEsn: ctx.marketTopEsn,
        // Axe RELATION (#2298.4, lot 19/09) : résolu côté API par
        // `AnalysisService.resolveRelationAxis` avant l'enqueue. Omis du wire
        // sans source réelle (IaClient) → run byte-identique, axe non mesuré.
        relationMissionsCount: ctx.relationMissionsCount,
        relationLastMeetingAt: ctx.relationLastMeetingAt,
        relationLastEmailAt: ctx.relationLastEmailAt,
        relationHumanCorrection: ctx.relationHumanCorrection,
        declaredPartners: ctx.declaredPartners,
        consultantHistory: ctx.consultantHistory,
        declaredSignalPresent: ctx.declaredSignalPresent,
        partnerPlacementsActive: ctx.partnerPlacementsActive,
        routeSignals: ctx.routeSignals,
        accumulatedRouteCriteria: ctx.accumulatedRouteCriteria,
        accountId,
        userId,
        // Portée équipe du grounding RAG : le dossier s'ancre sur la base de
        // connaissance de l'ESN (références, cas clients chargés par n'importe
        // quel membre), pas sur les seuls documents de celui qui lance le run.
        workspaceId: ctx.workspaceId,
        // Borne le thread du checkpointer sur CE run : les tentatives de ce job
        // se reprennent, une analyse ultérieure du même compte repart à neuf.
        // Le `jobId` NU ne suffisait pas — il est déterministe, donc partagé par
        // toutes les analyses successives du même compte. Voir `graphRunThreadId`.
        runId: ctx.graphRunId,
        // A non-empty checkpoint set means a prior attempt landed phases —
        // resume so the graph skips them instead of re-paying.
        resume: ctx.completedPhases.size > 0,
      },
      { signal: AbortSignal.any([ctx.jobTimeout, entityPause.signal]) },
    )

    // The stream normally ends with an explicit terminal event (``run_completed``
    // / ``run_skipped``). But that event travels over the network AFTER all the
    // real work is done — the ``plan`` phase's ``savePlan`` has already flipped the
    // account to 'completed' inside its own TX by the time the terminal event is
    // emitted. So any disruption in the final moments (a proxy max-connection cut,
    // the IA's post-loop checkpointer read raising, a network blip) can drop the
    // terminal event even though the dossier is fully persisted. Declaring such a
    // run failed would flip a COMPLETE dossier back to 'error' (the "flux SSE
    // tronqué" bug). So we track which phases actually landed and — if the stream
    // ends without a terminal event — judge success on the WORK DONE (below), not
    // on the clean receipt of the terminal event.
    let sawTerminal = false
    let gateNoGo = false
    // Phases persisted during THIS stream. Combined with ``ctx.completedPhases``
    // (phases that landed on a prior attempt, read from the outbox
    // ``analysis.phase_completed``) this is the source of truth for judging whether
    // the dossier is complete, independent of the terminal SSE event.
    const persistedThisStream = new Set<string>()
    // Which external sources degraded during this run, and which were called.
    // Only the terminal event carries it; stays null when the stream was cut
    // before then — and null must read as "unknown", never as "all sources fine".
    let runSourceHealth: RunSourceHealth | null = null
    // Reproducibility stamp (LOT 11, GA-311): which prompt template versions +
    // model produced this dossier. Only the terminal event carries it (research
    // already computes the fingerprint — see builder.py's `_prompt_versions_stamp`
    // — but nothing forwarded it here, which is why `analysis_runs.prompt_versions`
    // read NULL on every one of 40 real runs). Stays null when the stream carried
    // no summary, or an old IA deploy predates the stamp — null must read as
    // "not captured", never as "no prompt used".
    let runPromptVersions: Record<string, unknown> | null = null
    // #3235 — same terminal event, same null = "not read" rule.
    let runMarketMemoryVersion: string | null = null
    for await (const ev of events) {
      switch (ev.type) {
        case 'phase_completed':
          if (ev.phase) {
            try {
              await this.persistGraphPhase(ev.phase, ev.data, ctx)
            } catch (cause) {
              // A persistence/DB failure here (e.g. an LLM-derived value violating
              // a CHECK constraint) is a REAL error with a real cause. Re-throw it
              // CLASSIFIED so its cause surfaces verbatim in the log + the stored
              // error reason, and it can NEVER be conflated with the generic "flux
              // SSE tronqué" truncation banner below (reserved for a genuinely lost
              // terminal event). Throwing here exits the loop before that branch.
              throw this.persistenceError(ev.phase, ctx, cause)
            }
            persistedThisStream.add(ev.phase)
            // The research phase carries the go/no-go gate; a no-go is a
            // research-only terminal, still a success if its ``run_skipped``
            // event is later lost to a truncated stream.
            if (ev.phase === 'research' && graphGateIsNoGo(ev.data)) gateNoGo = true
            // #2164.17 — la recherche (déjà persistée, donc reprenable) rend deux
            // homonymes : on pose la question AVANT de payer contacts et plan.
            if (ev.phase === 'research' && ctx.entityPauseAllowed && !gateNoGo) {
              const question = entityQuestionFor(ev.data.output?.['research'], new Date())
              if (question) {
                entityPause.abort()
                throw new AnalysisAwaitingEntitySignal(question)
              }
            }
          }
          break
        case 'phase_skipped':
          if (ev.phase) {
            await this.emitSkippedGraphPhase(ev.phase, ctx)
            persistedThisStream.add(ev.phase)
          }
          break
        case 'judge_completed':
          // Anti-hallucination Judge (always-on, advisory) ran after the plan.
          // Store the verdict; NEVER let a verdict-write failure fail an
          // otherwise-completed run — the judge is advisory, not a gate.
          await this.persistGraphJudge(ev.data.judge, ctx)
          // #2164.10 — LE CONTRÔLE QUALITÉ, NOMMÉ. Le libellé de phase
          // existait déjà (`analysis:phases.quality_check`,
          // `PHASE_LABEL_KEYS` côté web) — « aujourd'hui le judge tourne en
          // silence entre plan @87 et analysis:done » disait déjà son
          // propre commentaire (`analysis-subscription.ts`). Rien
          // n'émettait jamais l'événement qui l'aurait allumé. Même
          // mécanisme que le pulse `'research'` plus haut
          // (`emitPhaseStarted`, un `phase`, pas encore un `step`) —
          // `analysisStore.ts` (`PHASE_STARTED_STEP`) fait le pont vers le
          // 8e `StepKey` (`ANALYSIS_STEPS`) qui porte sa prévisualisation.
          this.gateway.emitPhaseStarted(accountId, jobId, 'quality_check', 99)
          break
        case 'phase_failed':
        case 'run_failed': {
          // #2528/#2529 — ``phase_failed`` fires mid-stream and a graph error
          // ALWAYS routes straight to ``END`` (see ``_route_after`` / builder.py),
          // so the generator still yields a terminal ``run_failed`` for the same
          // failure right after. The `plan`-only soft-completion below already
          // finalises the run on the FIRST event; without this guard the second
          // event would re-run ``markCompleted``/``recordAnalysisCompleted``.
          if (sawTerminal) break
          // ``run_failed`` carries the same telemetry summary as a success —
          // including which sources degraded. Stamp it BEFORE throwing: a failed
          // run is precisely when "which brick broke" matters most, and this
          // branch used to discard the answer on its way out.
          const failureBreakdown = parseRunCostSummary(ev.data)
          if (failureBreakdown) {
            await this.runs.stampSourceHealth(ctx.accountId, failureBreakdown.sourceHealth)
          }
          const detail = describeGraphFailure(ev.data, ev.phase)
          // #2528/#2529 — a `plan`-phase failure lands AFTER research/contacts/
          // classify already succeeded and persisted (`plan` is the graph's last
          // phase — see `_PHASES` in builder.py). Doctrine: "l'analyse continue
          // avec ce qu'elle a" / "on archive, on ne supprime pas" — discarding an
          // already-complete dossier over the LAST phase's failure is exactly the
          // loss the doctrine forbids. Finalise as `completed` (no plan), the
          // same shape a gate no-go already uses for a research-only dossier.
          // Every OTHER phase failing still means the dossier itself never
          // finished, so it stays a real, terminal failure.
          if (ev.phase === 'plan') {
            sawTerminal = true
            await this.accounts.markCompleted(accountId)
            // No further phase_completed carries the plan, so record it here —
            // same reason `run_skipped` (gate no-go) does it inline below.
            await this.persistence.recordAnalysisCompleted(accountId, userId)
            this.logger.warn('Plan phase failed — dossier finalisé sans plan (dégradé, pas en échec)', {
              jobId,
              accountId,
              detail,
            })
            break
          }
          // A GENUINE analysis error the graph reported (e.g. Anthropic "credit
          // balance too low", a validation failure). Terminal by design: throwing
          // ``UnrecoverableError`` moves the job straight to failed and stops
          // BullMQ from retrying it, so a real failure NEVER retry-loops through
          // the (expensive) phases. Only a transient stream cut
          // (``AnalysisStreamInterruptedError`` below) rides the attempts budget.
          throw new UnrecoverableError(`Analysis failed in phase ${ev.phase ?? 'graph'}: ${detail}`)
        }
        case 'run_skipped':
          // Gate no-go: research ran but the account wasn't worth pursuing.
          // Terminate cleanly with the research-only dossier.
          sawTerminal = true
          await this.accounts.markCompleted(accountId)
          // No plan phase runs on a gate no-go, so savePlan (which records the
          // completed analysis) is skipped — record it here instead.
          await this.persistence.recordAnalysisCompleted(accountId, userId)
          break
        case 'run_completed': {
          sawTerminal = true
          // The terminal event carries the run's real cost: LLM tokens PLUS
          // every paid provider call (Apollo credits, Firecrawl pages, Pappers
          // lookups…). The per-phase accumulator above only ever saw token
          // cost, which is why the billing screen understated every analysis.
          // Falls back to that accumulator when the IA deploy predates the
          // field — a missing key must never zero a customer's cost.
          const breakdown = parseRunCostSummary(ev.data)
          if (breakdown) {
            ctx.setCost(resolveRunCostUsd(breakdown, ctx.readCost()))
            // Carried to the run-history write below: the append-only row is the
            // only place a per-run source status can be dated honestly.
            runSourceHealth = breakdown.sourceHealth
            await this.persistRunCost(ctx.accountId, breakdown)
          }
          // Reproducibility stamp (LOT 11, GA-311) — independent of the cost
          // breakdown above (an IA deploy could carry one without the other),
          // so parsed unconditionally rather than nested under `if (breakdown)`.
          runPromptVersions = parsePromptVersionsStamp(ev.data)
          runMarketMemoryVersion = parseMarketMemoryVersion(ev.data)
          // Détail par FOURNISSEUR (D19) : `persistRunCost` ci-dessus écrit le
          // total du run ; ici on garde qui a coûté quoi, pour que l'écran
          // backoffice puisse répondre « lequel a monté » quand la facture monte.
          {
            const rows = this.providerCosts?.parseHeader(
              typeof (ev.data as { provider_costs?: unknown }).provider_costs === 'object'
                ? JSON.stringify((ev.data as { provider_costs?: unknown }).provider_costs)
                : null,
            )
            if (rows?.length) {
              await this.providerCosts?.record(rows, {
                workspaceId: ctx.workspaceId ?? null,
                userId,
                accountId,
                feature: 'analysis',
              })
            }
            await ctx.flushTelemetry()
          }
          break
        }
      }
    }

    if (!sawTerminal && !(await this.finalizeTruncatedStream(ctx, persistedThisStream, gateNoGo))) {
      // #3820.c — la recette prod du 08/10 n'a trouvé AUCUN log journalisant
      // la cause avant la tentative suivante : le flux s'arrête ici SANS lever
      // d'exception (EOF silencieux, pas de "catch" à logger), donc rien ne
      // disait QUELLE phase manquait avant que le bandeau générique
      // ``AnalysisStreamInterruptedError`` ne l'efface. Journalisé ICI, avant
      // le throw, pendant que l'info est encore là.
      const persisted = new Set<string>([...ctx.completedPhases, ...persistedThisStream])
      // warn : coupure transitoire (ex. redéploiement Railway) qui se GUÉRIT
      // d'elle-même par la reprise ci-dessous ; l'épuisement des tentatives est
      // rapporté par `onFailed`, pas ici.
      this.logger.warn('Analysis stream ended without a terminal event (flux SSE tronqué)', {
        jobId,
        accountId,
        companyName: ctx.companyName,
        missingPhases: REQUIRED_GRAPH_PHASES.filter(phase => !persisted.has(phase)),
        persistedPhases: Array.from(persisted),
        elapsedMs: Date.now() - ctx.startedAt,
      })
      // Genuinely incomplete (a required phase never landed): a transient stream
      // cut mid-run (e.g. a Railway redeploy severing the SSE). Throw the typed
      // retryable error so BullMQ auto-retries on its ``attempts`` budget; the
      // retry re-enters the graph with ``resume: true`` (outbox checkpoints skip
      // the landed phases), so a mid-deploy cut SELF-HEALS without re-billing.
      // Only once the budget is exhausted does ``onFailed`` surface the French
      // banner for a manual resume.
      throw new AnalysisStreamInterruptedError(ctx.companyName)
    }

    this.logger.log('Analysis complete', { jobId, companyName: ctx.companyName })
    // #2164.11 — LA SAUVEGARDE, NOMMÉE. La persistance finale est réelle
    // (l'historique append-only juste en dessous, le coût, le compte rendu
    // produit) mais restait un backend muet : les `STEP_KEYS` s'arrêtaient à
    // `'messages'`, alors que ce bloc écrit encore après. Même mécanisme que
    // `'quality_check'` juste au-dessus — un `phase`, ponté vers son
    // `StepKey` par `PHASE_STARTED_STEP` (`analysisStore.ts`).
    this.gateway.emitPhaseStarted(accountId, jobId, 'save', 99)
    // Close out this run in the append-only history (Théo P0) with its final
    // cost. Best-effort (the service swallows its own errors) so a history-write
    // never turns a completed analysis into a failure.
    await this.runs.completeLatest(accountId, {
      status: 'completed',
      costUsd: ctx.readCost(),
      sourceHealth: runSourceHealth,
      promptVersions: runPromptVersions,
      marketMemoryVersion: runMarketMemoryVersion,
    })
    // Best-effort product event — carries the run's scope + final LLM cost so the
    // overview can report completion counts and cost/analysis. Covers both a
    // normal finish and a gate no-go (both reach this finalisation).
    void this.analytics?.track('analysis_completed', {
      userId,
      workspaceId: ctx.workspaceId ?? null,
      properties: { accountId, scope_mode: ctx.scopeMode ?? null, cost_eur: ctx.readCost() },
    })
    // Les offres d'emploi détectées deviennent des besoins PROPOSÉS — jamais
    // des besoins. Le point d'entrée 5 du PDF 4 avait été refusé parce que le
    // pipeline aurait écrit dans `project_needs`, une table qui n'est pas la
    // sienne, et parce qu'un pipe qui se remplit tout seul devient inutilisable.
    // Écrire dans une table de propositions résout les deux : le besoin naît
    // toujours d'un geste humain.
    void linkCrmDealsFor({ crmRead: this.crmRead }, ctx.workspaceId ?? null)
    void this.recordNeedProposals(ctx.workspaceId ?? null, accountId)
    void this.recordHistoricalNeeds(accountId)
    // Chantier « briefs comptes » (01/10/2026) — étape 5 du pipeline
    // (`agent_docs/pipeline.md`) : relit ce que les phases 1-4 viennent
    // d'écrire + les faits internes, un appel modèle, ses contrôles, puis
    // `raw_analysis.commercial_brief` — ou rien. Hors chemin critique (`void`,
    // ne jette jamais) : zéro latence ajoutée au dossier.
    // #4078 — les cinq blocs du dossier complet AVANT le brief, qui les relit
    // (liste blanche `DOSSIER_FACT_KEYS`). Les deux ne jettent jamais.
    void this.produceDossierBlocksThenBrief(accountId, ctx.workspaceId ?? null)
    // #3755.3 — chaque critère de la grille de l'espace évalué avec sa preuve,
    // hors chemin critique (`void`, ne jette jamais). Sans grille : aucune écriture.
    void this.qualification?.evaluateFromAnalysis(accountId, ctx.workspaceId ?? null)
    this.gateway.emitAnalysisDone(accountId, jobId)
    await this.events.completed({
      jobId,
      accountId,
      userId,
      durationMs: Date.now() - ctx.startedAt,
      correlationId: ctx.cid,
    })
    // #4462.9 — la DERNIÈRE analyse d'un lot de Laura pose le classement « par où commencer » (ne jette jamais).
    void this.batchFollow?.settled(accountId, userId)
    // Fan the completion out to the user's connected channels (Slack/Discord/
    // Teams/Google Chat + generic webhook for automation — Zapier/n8n). Fire and
    // forget: `notifyUser` never throws, but keep it off the critical path so a
    // slow channel can't delay job teardown.
    void this.integrations
      .notifyUser(userId, {
        type: 'analysis.completed',
        text: `✅ Dossier prêt — ${ctx.companyName}`,
        data: { accountId, companyName: ctx.companyName, link: `/accounts/${accountId}` },
      })
      .catch(() => undefined)
    this.cancellation.unregister(jobId)
  }

  /**
   * Decide the fate of a stream that ended WITHOUT a terminal event.
   *
   * Judges success on the work actually persisted (the union of prior-attempt
   * phases read from the outbox and the phases that landed this stream), NOT on
   * the clean receipt of the terminal SSE event:
   *  - a research-only gate no-go whose ``run_skipped`` was lost → finalise it
   *    exactly like the ``run_skipped`` branch (mark completed + record activity);
   *  - a full dossier (all four phases persisted → ``savePlan`` already flipped the
   *    account to 'completed') → let the caller run the normal success path;
   *  - anything genuinely incomplete → return ``false`` so the caller fails the run
   *    (banner + resume). Behaviour for a truly truncated run is unchanged.
   *
   * Returns ``true`` when the run should finalise as a success.
   */
  /** Store the per-provider cost/latency breakdown for operator drill-down.
   *
   * Best-effort on purpose: a telemetry write must never fail an analysis the
   * customer already paid for. The billable figure itself is persisted through
   * the normal ``setApiCost`` path, so losing this only costs the breakdown.
   */
  private async persistRunCost(accountId: string, breakdown: RunCostBreakdown): Promise<void> {
    try {
      await this.accounts.applyRunCostBreakdown(accountId, {
        totalCostUsd: breakdown.totalCostUsd,
        llmCostUsd: breakdown.llmCostUsd,
        providers: breakdown.providers,
        degradedSources: breakdown.degradedSources,
      })
    } catch (err) {
      this.logger.warn('Failed to persist run cost breakdown (non-fatal)', {
        error: err,
        tags: { accountId },
      })
    }
  }

  private async finalizeTruncatedStream(
    ctx: GraphRunContext,
    persistedThisStream: Set<string>,
    gateNoGo: boolean,
  ): Promise<boolean> {
    const { accountId, userId, jobId } = ctx
    const persisted = new Set<string>([...ctx.completedPhases, ...persistedThisStream])
    const persistedList = Array.from(persisted)

    if (gateNoGo && !persisted.has('plan')) {
      // A no-go whose run_skipped event was lost: no downstream phases run on a
      // no-go, so finalise exactly like the run_skipped branch above.
      this.logger.warn('SSE truncated after a no-go gate — finalising research-only dossier as completed', {
        jobId,
        accountId,
        companyName: ctx.companyName,
        persisted: persistedList,
      })
      await this.accounts.markCompleted(accountId)
      await this.persistence.recordAnalysisCompleted(accountId, userId)
      return true
    }

    if (REQUIRED_GRAPH_PHASES.every(phase => persisted.has(phase))) {
      // Plan landed → savePlan already flipped status to 'completed'. The dossier
      // is whole; the terminal event was merely lost in transit. The caller runs
      // the normal success finalisation (run history, WS done, notifications).
      this.logger.warn('SSE truncated after the dossier was fully produced — finalising as completed', {
        jobId,
        accountId,
        companyName: ctx.companyName,
        persisted: persistedList,
      })
      return true
    }

    return false
  }

  /**
   * Wrap a persistence/DB error thrown while writing a phase's output into a
   * CLASSIFIED, diagnosable error.
   *
   * A genuine write failure — the canonical case being an LLM-derived value that
   * violates a CHECK constraint (e.g. `account_vocabulary_kind_check`) — must
   * surface its REAL cause in both the logged error (via `onFailed`, which logs
   * this error object) and the stored error reason (`userFacingFailureReason`
   * passes our French messages through verbatim). It must NEVER be reported as the
   * generic "flux SSE tronqué" truncation banner, which is reserved for a genuinely
   * lost terminal event. The original cause is preserved for Sentry.
   *
   * Terminal by design: a write failure like a CHECK-constraint violation is
   * DETERMINISTIC — re-running the phase would hit the exact same error. Returning
   * an ``UnrecoverableError`` moves the job straight to failed so it is never
   * retry-looped through the (expensive) phases; the real cause surfaces at once.
   * Only the transient stream cut (``AnalysisStreamInterruptedError``) rides the
   * ``attempts`` budget.
   */
  private persistenceError(phase: string, ctx: GraphRunContext, cause: unknown): Error {
    const detail = cause instanceof Error ? cause.message : String(cause)
    const err = new UnrecoverableError(
      `L'analyse de ${ctx.companyName} a échoué à l'enregistrement de la phase « ${phase} » : ${detail}`,
    )
    ;(err as Error & { cause?: unknown }).cause = cause
    return err
  }

  /** Persist one completed phase + accumulate its telemetry + relay the WS pulse. */
  private async persistGraphPhase(phase: string, data: GraphPhaseCompletedData, ctx: GraphRunContext): Promise<void> {
    const { accountId, userId, phaseCtx } = ctx
    // `output` is guaranteed present by the event contract — a `phase_completed`
    // without it is rejected at the boundary rather than persisting an empty
    // dossier under a phase marked done. `telemetry` stays optional: losing a
    // cost figure degrades a dashboard, it does not corrupt the dossier.
    const telemetry = data.telemetry ?? {}
    // Scraped pages/PDFs can carry NUL bytes that Postgres jsonb rejects — strip
    // them before any persist call.
    const output = stripNullBytes(data.output)
    ctx.addCost(typeof telemetry.cost_usd === 'number' ? telemetry.cost_usd : 0)
    ctx.pushTelemetry(graphPhaseTelemetry(phase, telemetry))

    switch (phase) {
      case 'research': {
        // Le cadrage confirmé AVANT le débit mord ICI : une filiale écartée par
        // le commercial n'entre pas au dossier, et un thème écarté n'est plus
        // proposé comme angle. Sans cadrage, `applyScopeToResearch` rend le blob
        // tel quel (même référence) — dossier byte-identique à avant.
        // #4142.6 — « Déjà travaillées » lit le CRM de l'espace, et SEULEMENT quand il est demandé.
        const workedSirens = ctx.scopeSelection?.exclude_worked_accounts
          ? await this.persistence.workedSirens(ctx.workspaceId)
          : undefined
        const scopedResearch = applyScopeToResearch(
          output.research as Record<string, unknown> | undefined,
          ctx.scopeSelection,
          workedSirens ? { workedSirens } : {},
        )
        // #3219 (#190.2, lot P02 07/10) — le périmètre DÉCLARÉ de CE run
        // (`ctx.scopeMode`), stampé sur le blob pour que `AccountsService.applyResearch`
        // puisse journaliser la PORTÉE d'un effectif collecté sous ce périmètre.
        // Sans périmètre choisi (run legacy) : blob inchangé, même référence.
        const research =
          scopedResearch && ctx.scopeMode ? { ...scopedResearch, scopeMode: ctx.scopeMode } : scopedResearch
        await this.persistence.saveResearch(accountId, userId, research as AnalysisResearchData | undefined, phaseCtx)
        // Seed the Pappers dirigeants into the DB before classify, exactly as
        // the legacy path did.
        await this.persistence.seedPappersContacts(accountId, userId, research)
        // SIG-B — les recruteurs nommés par une offre gardée, même porte (bulkInsert).
        await this.persistence.seedJobRecruiterContacts(accountId, userId, research)
        break
      }
      case 'contacts': {
        const seeds = applyScopeToContactSeeds(
          (output.contacts as AnalysisContactSeed[] | undefined) ?? [],
          ctx.scopeSelection,
        )
        if (seeds.dropped > 0) {
          this.logger.log('Contacts écartés par le cadrage de collecte', {
            accountId,
            jobId: ctx.jobId,
            dropped: seeds.dropped,
          })
        }
        await this.persistence.saveContacts(accountId, userId, seeds.kept ?? [], phaseCtx)
        // #3742 — ceux que le périmètre géographique vient d'écarter : l'organigramme
        // (phase classify) ne doit pas les remettre à l'écran.
        ctx.geoDroppedNames = new Set(
          ((output.contacts as AnalysisContactSeed[] | undefined) ?? [])
            .filter(seed =>
              isOutsideGeoPerimeter(
                {
                  country: seed.country,
                  city: seed.city,
                  title: seed.title,
                  organization: seed.apolloDetails?.organization,
                },
                ctx.scopeSelection,
              ),
            )
            .map(seed => geoPersonKey(seed.fullName)),
        )
        // #3742/#3744 — la relance FUSIONNE dans le stock : sans ce rattrapage, les
        // contacts étrangers d'une analyse précédente restaient sous « France ».
        const excludedByGeo = await this.persistence.excludeContactsOutsideGeo(accountId, ctx.scopeSelection)
        // LUDB.5 — et les homonymes déjà rattachés (domaine employeur ≠ compte).
        const excludedHomonyms = await this.persistence.excludeHomonymContacts(accountId, ctx.website, ctx.workspaceId)
        if (excludedHomonyms > 0) {
          this.logger.log('Contacts d’homonymes écartés', { accountId, jobId: ctx.jobId, excluded: excludedHomonyms })
        }
        if (excludedByGeo > 0) {
          this.logger.log('Contacts existants écartés par le périmètre géographique', {
            accountId,
            jobId: ctx.jobId,
            excluded: excludedByGeo,
          })
        }
        // « X écartés (hors périmètre) » : the contacts phase 2 removed because
        // their employer is out of the chosen perimeter. Persisted so the dossier
        // can EXPLAIN the shrinking stock instead of leaving it unexplained.
        // No-op when the key is absent (nothing dropped, or an older IA deploy).
        await this.persistence.saveContactsOutOfScope(accountId, output.contacts_out_of_scope)
        break
      }
      case 'classify': {
        const classified = applyScopeToEnrichedContacts(
          (output.classified_contacts as AnalysisEnrichedContact[] | undefined) ?? [],
          ctx.scopeSelection,
        )
        await this.persistence.saveEnriched(accountId, classified.kept ?? [], phaseCtx, ctx.scopeMode)
        // Persist the org graph (decision chain / uncovered zones / stakeholder
        // map / approach order) into raw_analysis.org — dropped until now.
        // #3742 — un nœud personne dont le contact (même nom, ce compte) est hors
        // périmètre ne s'affiche pas ; un nœud sans pays connu reste.
        const org = await this.pruneOrgOutsideGeo(
          accountId,
          output.org_graph as Record<string, unknown> | undefined,
          ctx,
        )
        await this.persistence.saveOrgChart(accountId, org)
        break
      }
      case 'plan':
        // savePlan flips status → 'completed'.
        await this.persistence.savePlan(accountId, userId, output.plan as AnalysisPlanData | undefined, phaseCtx)
        // #3212.4/.6 (épopée #3235) — l'instantané du verdict de CE run, pour
        // qu'un futur run puisse un jour être comparé au précédent sans
        // recalculer le dossier. Best-effort, comme le reste de l'historique.
        await this.runs.stampVerdictSnapshot(accountId, output.plan as Record<string, unknown> | undefined)
        break
    }

    await ctx.flushTelemetry()
    this.emitGraphPhaseComplete(phase, output, ctx)
  }

  /**
   * #3742 — retire de l'organigramme les personnes écartées par le périmètre géographique.
   * #3820 — même geste pour un périmètre SITE (`city`), tant qu'une ville est saisie.
   */
  private async pruneOrgOutsideGeo(
    accountId: string,
    org: Record<string, unknown> | undefined,
    ctx: GraphRunContext,
  ): Promise<Record<string, unknown> | undefined> {
    const perimeter = ctx.scopeSelection?.geo_perimeter
    const isCity = perimeter === 'city' && (ctx.scopeSelection?.geo_areas?.length ?? 0) > 0
    if (!org || (perimeter !== 'france' && perimeter !== 'europe' && !isCity)) return org
    const names = new Set(ctx.geoDroppedNames ?? [])
    for (const name of await this.persistence.geoExcludedContactNames(accountId)) names.add(geoPersonKey(name))
    const pruned = pruneOrgGraphPeople(org, names)
    if (pruned.removed > 0) {
      this.logger.log('Organigramme : personnes hors périmètre retirées', { accountId, removed: pruned.removed })
    }
    return pruned.org
  }

  /** WS pulses for a completed phase: its completion + the next phase's start. */
  private emitGraphPhaseComplete(phase: string, output: Record<string, unknown>, ctx: GraphRunContext): void {
    const { accountId, jobId } = ctx
    const complete = GRAPH_PHASE_COMPLETE[phase]
    if (complete) {
      const payload =
        phase === 'contacts'
          ? { contacts: output.contacts }
          : phase === 'classify'
            ? { contacts: output.classified_contacts }
            : (output.research as Record<string, unknown> | undefined)
      this.gateway.emitPhaseComplete(accountId, jobId, complete.event, complete.pct, payload)
    }
    const next = GRAPH_NEXT_STARTED[phase]
    if (next) this.gateway.emitPhaseStarted(accountId, jobId, next.phase, next.pct)
  }

  /** A phase the graph skipped on resume: reload its data from the DB and relay
   *  the completion pulse (no re-persist, no outbox re-emit).
   *
   *  ``plan`` needs its own branch. It has no entry in either pulse table (the
   *  run normally finishes straight into ``analysis:done``), so this method used
   *  to be a COMPLETE no-op for it: a skipped plan relayed nothing, persisted
   *  nothing, and — fatally — never reached ``savePlan``, the only place that
   *  flips the account to ``completed``. The run then walked the whole success
   *  path (history closed green, "✅ Dossier prêt" sent) on an account left in
   *  ``analyzing`` with no plan. See {@link finalizeSkippedPlan}. */
  private async emitSkippedGraphPhase(phase: string, ctx: GraphRunContext): Promise<void> {
    const { accountId, userId, jobId } = ctx
    if (phase === 'plan') {
      await this.finalizeSkippedPlan(ctx)
      return
    }
    const complete = GRAPH_PHASE_COMPLETE[phase]
    if (complete) {
      let payload: Record<string, unknown> | undefined
      if (phase === 'research') {
        payload = (await this.persistence.loadResearch(accountId, userId)) as Record<string, unknown> | undefined
      } else if (phase === 'contacts') {
        payload = { contacts: (await this.persistence.loadContactsForResume(accountId, userId)).seeds }
      } else if (phase === 'classify') {
        payload = { contacts: (await this.persistence.loadContactsForResume(accountId, userId)).classified }
      }
      this.gateway.emitPhaseComplete(accountId, jobId, complete.event, complete.pct, payload)
    }
    const next = GRAPH_NEXT_STARTED[phase]
    if (next) this.gateway.emitPhaseStarted(accountId, jobId, next.phase, next.pct)
  }

  /**
   * Close out a ``plan`` phase the graph decided it had already run.
   *
   * The graph's checkpointer marks a phase done when its NODE ran; we mark it
   * done when the WRITE committed. A stream severed between the two leaves the
   * graph permanently convinced the plan exists — it will skip it on every
   * relaunch — while our DB never received it. So the graph's word is not
   * enough: we ask our own database.
   *
   *  - plan present → the skip is legitimate (it landed on an earlier attempt).
   *    Flip the account to ``completed`` and record the activity, exactly as
   *    ``savePlan`` would have, then relay the completion pulse so a client
   *    watching the run leaves 87 % instead of freezing there forever.
   *  - plan absent → the checkpoint is lying. Throw, so the run surfaces as the
   *    failure it is instead of sending "✅ Dossier prêt" for an empty dossier.
   *    ``UnrecoverableError`` because retrying changes nothing: the graph would
   *    skip the plan again for as long as its thread says it ran.
   */
  private async finalizeSkippedPlan(ctx: GraphRunContext): Promise<void> {
    const { accountId, userId, jobId, companyName } = ctx

    if (!(await this.persistence.hasPersistedPlan(accountId, userId))) {
      this.logger.error('Graph skipped the plan phase but no plan is persisted — refusing to report success', {
        jobId,
        accountId,
        companyName,
      })
      throw new UnrecoverableError(
        `Analysis produced no plan for ${companyName}: the graph skipped phase 4 but no plan is persisted`,
      )
    }

    this.logger.warn('Plan phase skipped by the graph — finalising from the persisted plan', {
      jobId,
      accountId,
      companyName,
    })
    await this.accounts.markCompleted(accountId)
    await this.persistence.recordAnalysisCompleted(accountId, userId)
    this.gateway.emitPhaseComplete(accountId, jobId, 'plan_complete', 100, undefined)
  }

  /**
   * Persist the anti-hallucination Judge verdict into ``raw_analysis.judge``.
   *
   * The Judge is advisory (it flags, never blocks) and runs after a run has
   * effectively completed — the plan is already saved and the account already
   * flipped to ``completed``. So this write is BEST-EFFORT: a failure is logged
   * and swallowed, never rethrown, so a hiccup persisting an advisory verdict
   * can never turn a completed dossier into an ``error``. NUL bytes (a contact
   * name copied from a scraped page can carry one) are stripped, exactly as for
   * phase output, so Postgres jsonb accepts the payload.
   */
  /**
   * #4078 — l'étape « blocs du dossier » (parité démo) puis le brief commercial,
   * EN SÉRIE : le brief relit les cinq blocs. Hors chemin critique ; aucune des
   * deux ne jette (best-effort), la seconde part même si la première échoue.
   */
  private async produceDossierBlocksThenBrief(accountId: string, workspaceId: string | null): Promise<void> {
    await this.dossierBlocks?.produceDossierBlocks(accountId, workspaceId)
    await this.commercialBrief?.produceCommercialBrief(accountId, workspaceId)
  }

  /**
   * Transforme les offres d'emploi détectées en besoins PROPOSÉS.
   *
   * Lit ce que l'analyse vient d'écrire plutôt que de retenir un état pendant
   * tout le run : le dossier est la source, et une copie en mémoire divergerait
   * dès qu'une phase tardive corrige une offre.
   *
   * Entièrement best-effort et sans espace de travail, sans rien : une
   * suggestion n'a aucun droit sur un dossier terminé.
   */
  private async recordNeedProposals(workspaceId: string | null, accountId: string): Promise<void> {
    // Lot 762 P4 — chemin PARTAGÉ avec l'actualisation (`research-followups.ts`).
    await recordNeedProposalsFor(
      { persistence: this.persistence, needProposals: this.needProposals, logger: this.logger },
      workspaceId,
      accountId,
    )
  }

  /**
   * #4760 — l'analyse LIT ses besoins historiques et les NOMME dans le dossier (`raw_analysis.historical_needs`).
   * Lot 762 P4 : le corps vit dans `research-followups.ts`, appelé AUSSI par l'actualisation.
   */
  private async recordHistoricalNeeds(accountId: string): Promise<void> {
    await recordHistoricalNeedsFor({ persistence: this.persistence, logger: this.logger }, accountId)
  }

  private async persistGraphJudge(verdict: unknown, ctx: GraphRunContext): Promise<void> {
    const clean = stripNullBytes((verdict as Record<string, unknown> | undefined) ?? {})
    if (Object.keys(clean).length === 0) return
    try {
      await this.persistence.saveJudge(ctx.accountId, clean)
    } catch (err) {
      this.logger.warn('Failed to persist judge verdict (non-fatal, advisory)', {
        jobId: ctx.jobId,
        accountId: ctx.accountId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  /**
   * Worker-level error (NOT job-scoped): a Redis connection drop, a lock-renewal
   * failure, a malformed message off the queue. BullMQ keeps the worker alive and
   * its ioredis client reconnecting (see bullConnectionOptions), so this is only a
   * logging hook — surface it in Sentry (repo convention: pass meta through the
   * logger, never call Sentry directly) and NEVER exit. A transient infra error
   * must not take the process — and every in-flight analysis — down.
   */
  @OnWorkerEvent('error')
  onError(error: Error): void {
    this.logger.error('Analysis worker error (non-fatal — worker stays up, reconnecting)', {
      error,
      tags: { queue: 'analysis' },
    })
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<AnalysisJobData>): void {
    const jobId = job.id ?? job.data.accountId
    this.cancellation.unregister(jobId)
    // Real delivery for the "Signaux d'achat" toggle: fire-and-forget an in-app
    // notification if the finished account carries buy signals and the owner
    // opted in. Never awaited — a notification must not delay or fail the job.
    void this.notifications.notifyBuySignalForAccount(job.data.accountId).catch(err => {
      this.logger.warn('buy-signal notification failed (non-fatal)', {
        jobId,
        error: err instanceof Error ? err.message : String(err),
      })
    })
  }

  /**
   * Terminal-failure handler.
   *
   * BullMQ fires `failed` on every attempt, including intermediate ones, so we filter first:
   * terminal = `UnrecoverableError` (any attempt) OR all retry attempts exhausted.
   *
   * We check `error.name` instead of `error instanceof UnrecoverableError` because in distributed
   * setups the error is deserialized from Redis and loses its prototype chain. `name` survives JSON.
   *
   * At terminal failure we ALWAYS log + push the payload to the DLQ (post-mortem + manual replay,
   * ops-only, never a claim to the user). Flipping Supabase status to `error`, refunding the credit,
   * and emitting `analysis:error` over WS only happen when `classifyAnalysisFailureOutcome` says
   * `failed` (#2478 — a request that left without a response is `unknown`, and stays untouched for
   * `StuckAnalysisReaper` to resolve from what actually landed).
   */
  @OnWorkerEvent('failed')
  async onFailed(job: Job<AnalysisJobData>, error: Error): Promise<void> {
    const jobId = job.id ?? job.data.accountId
    const attemptsMade = job.attemptsMade
    const maxAttempts = job.opts.attempts ?? 1
    const unrecoverable = error?.name === 'UnrecoverableError'
    const terminal = unrecoverable || attemptsMade >= maxAttempts

    if (!terminal) {
      this.logger.warn('Analysis attempt failed, will retry', {
        jobId,
        attemptsMade,
        maxAttempts,
        error: error.message,
      })
      return
    }

    // #2478 — la seule distinction qui compte : la requête a-t-elle pu PARTIR ?
    // Voir la docstring de `classifyAnalysisFailureOutcome` plus haut.
    const outcome = classifyAnalysisFailureOutcome(error, unrecoverable)

    // The Winston → Sentry transport maps `tags`/`user`/`contexts` meta keys to Sentry scope
    // fields, so there's no need to open an explicit `Sentry.withScope` here.
    this.logger.error('Analysis terminal failure', {
      error,
      tags: {
        queue: 'analysis',
        job_id: jobId,
        unrecoverable: String(unrecoverable),
        outcome,
        ...(job.data.correlationId ? { correlation_id: job.data.correlationId } : {}),
      },
      user: { id: job.data.userId },
      contexts: {
        job: {
          accountId: job.data.accountId,
          companyName: job.data.companyName,
          attemptsMade,
          maxAttempts,
        },
      },
    })

    if (outcome === 'unknown') {
      // #2478 — « un timeout n'est PAS un échec » (CLAUDE.md) : on n'affirme
      // PAS que ce run a échoué (la requête a pu aboutir côté fournisseur), donc
      // on NE bascule PAS le compte à `error` — il reste dans son état courant,
      // avec tout ce qui a déjà été checkpointé (phases persistées dans
      // l'outbox, dossier partiel conservé). `unknown` ARRÊTE la reprise
      // AUTOMATIQUE : BullMQ a épuisé ses tentatives et on ne rejoue pas
      // nous-même ici — un geste MANUEL reste possible. `StuckAnalysisReaper`
      // (+ la réparation à la lecture de `AnalysisService.getStatus`) résolvent
      // ce compte depuis l'état RÉEL de son dossier, jamais depuis une
      // supposition, une fois le délai de sécurité (`JOB_TIMEOUT_MS`) écoulé —
      // et remboursent le crédit À CE MOMENT-LÀ via leur transition gardée sur
      // `status='analyzing'` (exactement-une-fois). Rembourser ou marquer
      // `error` ICI EN PLUS créerait un double remboursement ou une fausse
      // déclaration d'échec.
      this.logger.warn('Analysis terminal outcome is unknown — account left untouched, no forced status', {
        jobId,
        accountId: job.data.accountId,
      })
    } else {
      // User-facing reason: opaque BullMQ/infra strings ("job stalled …") become
      // French; our own thrown errors (already French) pass through. Raw error stays
      // in logs/Sentry/DLQ above/below for post-mortem.
      const reason = userFacingFailureReason(error.message)

      // Status update is best-effort: if it fails, the DLQ entry still exists for recovery.
      try {
        await this.accounts.markErrored(job.data.accountId, reason)
      } catch (err) {
        this.logger.warn('Failed to update account status to error', {
          jobId,
          error: err instanceof Error ? err.message : String(err),
        })
      }

      // Mirror the terminal failure onto the run history (Théo P0). The service is
      // best-effort and never throws, so no extra guard is needed here.
      await this.runs.completeLatest(job.data.accountId, { status: 'error' })

      // Refund the analysis slot claimed at launch — a run that terminally failed
      // must not burn a credit (Théo §7 billing: "réserver au lancement, débiter à
      // la fin, rembourser si échec non utilisateur"). Force launches never claimed
      // one (slotConsumed=false). Best-effort: a refund miss only over-charges by one,
      // it must not mask the failure. Cancellations short-circuit before this handler.
      if (job.data.slotConsumed) {
        try {
          await this.credits.refundAnalysisSlot(job.data.userId, {
            reason: `échec run: ${job.data.companyName}`,
            accountId: job.data.accountId,
          })
        } catch (err) {
          this.logger.warn('Failed to refund analysis slot after terminal failure', {
            jobId,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }

      this.gateway.emitAnalysisError(job.data.accountId, jobId, reason)
    }

    // Best-effort domain event for ops dashboards. Reuses the user-facing
    // message if it was preserved through callIa's UnrecoverableError wrap.
    // Emitted for BOTH outcomes — an `unknown` run still deserves an ops signal,
    // it just never claims a definitive cause it doesn't have.
    await this.events.failed({
      jobId,
      accountId: job.data.accountId,
      userId: job.data.userId,
      errorCode: outcome === 'unknown' ? 'UNKNOWN_NO_RESPONSE' : unrecoverable ? 'UNRECOVERABLE' : 'RETRIES_EXHAUSTED',
      userMessage: error.message,
      correlationId: job.data.correlationId,
    })
    // #4462.9 — un échec ferme sa place dans le lot : il ne reste jamais suspendu à une analyse perdue.
    void this.batchFollow?.settled(job.data.accountId, job.data.userId)

    this.cancellation.unregister(jobId)

    // DLQ carries the full payload so an admin can replay without re-deriving the
    // input — written for BOTH outcomes (operator visibility, never a claim to
    // the user), `outcome` lets triage tell the two apart at a glance.
    try {
      const dlqPayload: DlqPayload = {
        originalJobId: jobId,
        payload: job.data,
        failedReason: error.message,
        unrecoverable,
        outcome,
        attemptsMade,
        maxAttempts,
        correlationId: job.data.correlationId ?? null,
        failedAt: new Date().toISOString(),
      }
      await this.dlq.add('terminal-failure', dlqPayload)
    } catch (err) {
      this.logger.error('Failed to enqueue DLQ item', {
        jobId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
}
