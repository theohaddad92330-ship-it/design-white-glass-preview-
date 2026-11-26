import { InjectQueue } from '@nestjs/bullmq'
import type { AccumulatedRouteCriteria, RouteSignals } from '../account-access/route-signals'
import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { type Job, type Queue } from 'bullmq'
import { createHash, randomUUID } from 'crypto'
import {
  ANALYSIS_DEPTH_PRESETS,
  SELECTABLE_ANALYSIS_RUN_DEPTHS,
  type AnalysisBatchCandidate,
  type AnalysisEntityAnswer,
  type AnalysisEntityQuestion,
  analysisEntityQuestionSchema,
  type AnalysisRunDepth,
  type AnalysisContext,
  type AnalysisProfileData,
  type AnalysisScopeMode,
  type AnalysisScopeSelection,
  buildIdentityMismatchMessage,
  contextModeExcludes,
  DEFAULT_LAURA_CONTEXT_MODE,
  resolveByPrecedence,
  esnAnswersToProfileData,
  type EsnAnswers,
  type LauraContextMode,
  forecastPublicTenderSources,
  isSameRegistryIdentity,
  geoScopeFromOriginCriteria,
  isDiscoverOriginCriteriaEmpty,
  isScopeSelectionEmpty,
  readEntityResolution,
  resolveRunProfileMode,
  type RecordedRunProfileProvenance,
  type RelationshipMemory,
  renderAnalysisContext,
  type ChannelPerformance,
  type RolePerformance,
  type AnglePerformance,
  type OutcomeRecommendation,
  type OutcomeRecommendationDimension,
} from '@bellum/contracts'
import { formatRelationshipMemory } from './relationship-memory'
import { MARKET_PATH_AXIS_SOURCE, type MarketPathAxisSource } from './market-path-axis-source'
import { AnalysisFactsInputsService } from './analysis-facts-inputs.service'
import {
  knownContactsFromCrm,
  mergeKnownContacts,
  type AnalysisAccountFact,
  type AnalysisKnownContact,
} from './analysis-facts-inputs'
import { AnalysisAttachmentBinderService } from './analysis-attachment-binder.service'
import { RelationAxisReaderService } from './relation-axis-reader.service'
import { ChannelPerformanceReaderService } from './channel-performance-reader.service'
import { failure, isFailure, success, type Result } from '@bellum/utils'
import type { AccountEntity } from '../../database/entities/account.entity'
import type { WorkspaceAuthor } from '../../common/workspace-authors'
import { getCorrelationId } from '../../correlation-id/correlation-id.store'
import { AccountFeedbackService } from '../account-feedback/account-feedback.service'
import { AccountsService, ANALYSIS_INTERRUPTED_MESSAGE } from '../accounts/accounts.service'
import type { BusinessUnitScopeClause } from '../accounts/business-unit-scope.clause'
import { ContactsService } from '../contacts/contacts.service'
import { CreditsService, resolveAnalysisCost } from '../credits/credits.service'
import { CrmReadService } from '../crm/crm-read.service'
import { domainFromWebsite } from '../crm/crm-presence'
import { ProjectsService } from '../projects/projects.service'
import { renderWorkspaceLearning } from '../projects/workspace-learning'
import { ZeroLayerService } from '../zero-layer/zero-layer.service'
import { EsnProfileReader } from '../esn-profile/esn-profile-reader.service'
import { OrgGraphVersionService } from '../org-graph/org-graph.service'
import { AnalysisCancellationService } from './analysis-cancellation.service'
import { JOB_TIMEOUT_MS, PHASE_PROGRESS, PROGRESS_PHASES } from './analysis.constants'
import { AnalysisCheckpointReader } from './analysis-checkpoint.reader'
import {
  SellerHypothesesReader,
  canReplaceLauraFraming,
  discoverOriginOfAccount,
  lauraFramingOf,
  withDiscoverOrigin,
  type SellerHypothesesForRun,
} from './seller-hypotheses.reader'
import { relationStatusForRun } from './commercial-status'
import { AnalysisPersistenceService } from './analysis.persistence'
import { AnalysisRunsService } from './analysis-runs.service'
import { StartAnalysisDto } from './dto/start-analysis.dto'
import { ProductAnalyticsService } from '../analytics/product-analytics.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspaceMarketService } from '../workspace/workspace-market.service'
import { SOFT_BRAKE_MESSAGE } from '../credits/soft-brake'

type AnalysisFailureCode =
  | 'not_found'
  | 'create_failed'
  | 'quota_exceeded'
  | 'demo_workspace'
  // GA-96 — la relance demandait une société différente de celle du dossier.
  // Refus AVANT le débit : rien n'a tourné, rien n'a été écrit, rien n'est dû.
  | 'identity_mismatch'
  // #2975 — la porte de coût par espace a refusé l'action AVANT tout débit :
  // `message` NOMME la limite dépassée (`CreditsService.consumeAnalysisSlot`
  // → `WorkspaceBudgetService.checkGate`), jamais un « budget dépassé » générique.
  | 'budget_exceeded'
  // Audit H1 — annuler une analyse qui n'est plus en cours (terminée, en échec,
  // déjà annulée). Refus AVANT toute écriture : rien n'est rendu.
  | 'not_cancellable'
  // #2164.17 — répondre à une question d'identité qui n'attend plus (run
  // repris, terminé, ou jamais mis en pause). Refus AVANT toute écriture.
  | 'no_entity_question'
  // #2164.17 — un SIREN hors des candidats posés : jamais deviné ni accepté.
  | 'invalid_entity_answer'

export type AnalysisFailure = {
  code: AnalysisFailureCode
  message: string
}

/**
 * #2704 — LE PÉRIMÈTRE DE LECTURE D'UN COMPTE, résolu au BORD et passé tel quel.
 *
 * Le cloisonnement se résout dans le contrôleur — c'est la règle écrite une
 * fois pour tous (`resolveBusinessUnitScope`, « la règle du fail-closed ») —, et
 * ce service le REÇOIT. Aucun second modèle de droits n'est inventé ici : ce
 * sont les deux bornes que `AccountsService.findOneForWorkspace` connaît déjà.
 *
 * Absent (appel interne, specs) ⇒ lecture par PROPRIÉTAIRE, le chemin d'avant :
 * un périmètre manquant n'ouvre jamais rien de plus, il rétrécit.
 */
export type AnalysisAccountScope = {
  workspaceId: string
  businessUnitScope: BusinessUnitScopeClause
}

/**
 * #1583 — ce qui VA se passer si on lance CETTE analyse, avant tout clic.
 *
 * Trois scénarios, et rien d'autre : `demo` (l'espace ne débite jamais, voir
 * `start()`), `cache_hit` (un dossier complet et frais existe déjà — le
 * lancement rouvrirait ce dossier sans rien débiter) et `fresh` (une analyse
 * neuve, au coût canonique du périmètre). Un chiffre annoncé ici qui ne serait
 * pas celui débité recréerait le défaut du 04/08 (1 crédit annoncé, 8 débités).
 */
type AnalysisLaunchPlan =
  | { scenario: 'demo' }
  | { scenario: 'cache_hit'; accountId: string; companyName: string }
  | {
      scenario: 'fresh'
      credits: number
      /** #3288 — les trois paliers de profondeur : coût (même fonction que le
       *  débit), pages lues, durée MÉDIANE mesurée (`null` = non mesurée). */
      depths: Array<{ depth: AnalysisRunDepth; credits: number; pages: number; medianSeconds: number | null }>
      /** #2288.4 (c66) — BOAMP/DECP, quand la gate de collecte les gardera à
       *  coup sûr pour CE lancement ; vide quand on ne peut pas le savoir. */
      publicTenderSources: ReturnType<typeof forecastPublicTenderSources>
      /**
       * #2292.17/.18 (épopée #2929, LAU-FINAL-033) — ce nom résout un dossier
       * DÉJÀ analysé, mais hors de la fenêtre de cache (`CACHE_MAX_AGE_DAYS`) :
       * `scenario: 'fresh'` dirait « analyse neuve » alors qu'un dossier
       * existe et serait DUPLIQUÉ, pas ouvert. Absent ⇒ nom jamais vu.
       */
      knownAccount?: { accountId: string; companyName: string }
      /**
       * Théo B r1-recherche.A12 — un run est DÉJÀ en vol sur ce nom (`start()` le rejoindrait, `reason: 'in_flight'`) :
       * l'écran le dit avant le clic, avec le prénom de qui l'a lancé quand ce n'est pas soi. Absent ⇒ rien en vol.
       */
      inFlight?: { accountId: string; companyName: string; startedBy?: WorkspaceAuthor }
    }

/** Operator backoffice control mode for {@link AnalysisService.cancelByAdmin}:
 *  ``stop`` cancels a live run (status → ``canceled``), ``force_error`` frees a
 *  stuck/zombie ``analyzing`` row that no longer has a live job (status →
 *  ``error``) so it stops shadowing the UI. In-file only (the controller passes a
 *  validated literal) — knip flags exported types consumed only in their file. */
type AdminStopMode = 'stop' | 'force_error'

/** Reason stamped on an account when an operator force-errors a stuck/zombie run
 *  from the backoffice — distinct from the user-cancel message. */
const ANALYSIS_ADMIN_FORCE_ERROR_MESSAGE = 'Analyse arrêtée par un administrateur (run bloqué).'

/** Pourquoi `start` n'a PAS enqueué un nouveau job. Purement informatif (message
 *  UI) — la décision d'afficher ou non une progression tient au seul `launched`. */
type AnalysisStartReason = 'cache_hit' | 'in_flight' | 'demo_replay'

/**
 * `launched` = « un run est-il EN COURS pour ce compte ? ». C'est le contrat qui
 * permet au front de ne PAS ouvrir une carte de progression fantôme.
 *
 * Incident prod 19/07 (TF1) : les court-circuits de `start` (result cache, replay
 * démo) renvoyaient la même forme `{ jobId, accountId }` qu'un vrai lancement.
 * Le front seedait alors un run à 0% « Lancement de l'analyse » et s'abonnait à
 * des events Socket.IO qui n'arriveraient jamais — bloqué à 0% jusqu'au GC de
 * staleness (30 min), avec un clic qui renvoyait sur le dossier périmé.
 *
 * `launched: true` couvre AUSSI le job déjà en vol (`in_flight`) : un run tourne
 * réellement, l'abonnement WS est légitime. Seuls les cas « rien ne tourne »
 * (`cache_hit`, `demo_replay`) sont à false.
 */
/** #4119 — l'état du créneau d'analyse débité par un lancement/une reprise, pour le rendre si la suite lève. */
type SlotClaim = { held: boolean; cost: number; accountId?: string; owner?: string; company?: string }

type AnalysisStartResult = {
  jobId: string
  accountId: string
  launched: boolean
  reason?: AnalysisStartReason
  /**
   * #2704.1 — QUI a lancé le run qu'on rejoint (`reason: 'in_flight'`), quand
   * ce n'est PAS l'appelant. `undefined` = rien à nommer : c'est son propre
   * run, aucun contexte d'espace résolu, ou l'auteur n'a pas pu être lu — le
   * front garde alors son message générique, jamais un nom deviné.
   */
  startedBy?: WorkspaceAuthor
}

type AnalysisStatusResult = {
  jobId: string
  state: 'active' | 'completed' | 'failed' | 'canceled' | 'not_found'
  /**
   * 0..100, or **null when the server genuinely cannot say how far along the
   * run is**. Null is a real answer, not a missing one: the client renders
   * "en cours" with no figure rather than a fabricated percentage. A progress
   * bar reading 0% on a run that is 80% done tells the user their analysis is
   * stuck, which is a worse lie than admitting we don't know.
   */
  percent: number | null
  phase: string | null
  /**
   * Canonical pipeline phases (research/contacts/classify/plan) this run has
   * actually checkpointed, oldest-first. Lets a client that joined late rebuild
   * its step checklist from state instead of showing step 1 while four phases
   * are done. Empty = no phase has completed yet (or the run predates the
   * outbox), never "we didn't look".
   */
  completedPhases: string[]
  /**
   * #2283.32 — le verdict du Résolveur d'identité (#2284) au moment où
   * l'analyse se termine. `undefined`/`null` : pas d'ambiguïté (ou run pas
   * encore terminé) ; renseigné : `raw_analysis.entity_resolution.state` vaut
   * `ambiguous` — le lot qui a lancé ce run garde son sous-job ouvert
   * (`needs_resolution`) plutôt que de le dire `done` sur une identité encore
   * en question.
   */
  entityAmbiguity?: { candidates: AnalysisBatchCandidate[] } | null
}

type AnalysisJobData = {
  accountId: string
  userId: string
  companyName: string
  // Team scope of the run — lets the worker stamp `analysis_completed` with the
  // workspace for the activity journal. Optional: legacy queued jobs lack it.
  workspaceId?: string
  // Scope lock (Théo p.10) : SIREN de l'entité choisie — transmis au worker qui
  // l'ancre dans la recherche Pappers (au lieu de re-résoudre le nom).
  siren?: string
  // Périmètre d'analyse (Théo p.10/21) : groupe/france/filiales/it_digital/…
  scopeMode?: string
  // Cadrage confirmé AVANT le débit (Théo P0-02) : priorités + exclusions
  // d'entités/thèmes. Le worker l'applique aux sorties de phases avant de les
  // persister. Absent (cadrage vide) ⇒ dossier inchangé.
  scopeSelection?: AnalysisScopeSelection
  // Marché cible (pays) du workspace, ex. "CH" — propagé à l'IA (param `country`)
  // pour activer le country pack correspondant. Absent pour le marché FR (défaut)
  // afin que le chemin français reste strictement inchangé sur le fil.
  country?: string
  profileData: Record<string, unknown>
  // #2451.1 — le mode de contexte du run, SEULEMENT quand il n'est pas « Mon
  // activité » : le chemin historique garde un job (et un wire IA) byte-identique.
  // Le worker le relaie à la phase 4, dont le prompt dit alors pourquoi le
  // profil manque (`analysis_context_mode_block`, service IA).
  contextMode?: LauraContextMode
  userContext?: AnalysisContext | string
  // Mémoire de corrections du compte (feedback loop A2) : directives factuelles
  // condensées depuis les retours utilisateur du workspace sur cette entreprise.
  // Absent quand il n'y a aucun feedback → chemin IA byte-identique.
  accountFeedback?: string
  // Mémoire du graphe d'organigramme (Annexe Organigramme §5) : version courante
  // + éléments écartés à ne jamais réinjecter. Absents quand il n'y a rien à se
  // rappeler → chemin IA byte-identique.
  orgGraphVersion?: number
  orgRejectedItems?: Array<{ sourceId: string; reason: string }>
  // Couche zéro (annexe méthodo p8) : le relevé du CRM connecté de l'ESN sur ce
  // compte. Renseigné SEULEMENT quand le CRM matche — le run sait alors que le
  // compte n'est pas froid. Absent (aucun CRM connecté) = pipeline inchangé.
  crmPresence?: string
  // Couche zéro, suite (p8) : les AUTRES outils internes de l'ESN — documents
  // Drive, notes, e-mails, ATS. Même contrat que `crmPresence` : renseigné
  // SEULEMENT sur une trouvaille réelle, absent (aucune intégration connectée)
  // = pipeline inchangé.
  internalHistory?: string
  /** #3753.3 — ce que l'ESN a dit de ce compte dans son ciblage (tier, raison,
   *  problématiques, projets IT). FOURNI, NON VÉRIFIÉ ; absent = aucun ciblage. */
  sellerHypotheses?: SellerHypothesesForRun
  /** Boucle d'apprentissage (§6) — bloc rendu côté API, absent quand l'équipe
   *  n'a jamais déplacé de besoin. */
  workspaceLearning?: string
  /** #3278.3 — canaux MESURÉS de l'espace (réponse sous 14 j) ; absent sans mesure. */
  channelPerformance?: ChannelPerformance[]
  // Kanban commercial du compte (annexe méthodo p6) : la colonne où le
  // commercial a rangé ce compte. Absent quand le compte n'a jamais été trié
  // (`inbox`) → relation « froide » par défaut, pipeline inchangé.
  commercialStatus?: string
  // Axe CHEMIN de l'adressabilité (#1631.3/.4, #1606.2, lot 14) : le compte de
  // parcours AGRÉGÉ résolu par `MarketMemoryService.pathAxisFor` + l'ESN la plus
  // observée pour nommer la preuve. Absents (aucune couverture, ou sous le seuil
  // transverse `MARKET_MEMORY_MIN_PATHS`) → pipeline inchangé, axe non mesuré.
  marketPathsObserved?: number
  marketTopEsn?: string
  /** Site déjà connu du compte (tome 2 §13) : sert à dériver le slug d'un board
   *  d'offres Greenhouse/Lever. Absent sur un compte neuf → pipeline inchangé. */
  website?: string
  correlationId?: string
  // Whether a plan analysis slot was claimed for this run (false for operator
  // ``force`` launches, which bypass the quota). The worker refunds it on
  // terminal failure so a failed run doesn't burn a credit (Théo §7 billing:
  // "rembourser automatiquement si échec non utilisateur").
  slotConsumed?: boolean
  /** #2164.17 — la question d'identité posée par le worker en pause (`analysis-entity-pause.ts`). */
  entityQuestion?: unknown
  /** #2164.17 — la réponse rangée par {@link AnalysisService.answerEntityQuestion}. */
  entityAnswer?: { siren: string; answeredAt: string }
}

const ACTIVE_JOB_STATES = ['active', 'waiting', 'waiting-children', 'delayed', 'prioritized'] as const

/**
 * Demo replay lookup window (demo mode C1): the seeded golden dossiers must
 * stay replayable for the demo workspace's whole lifetime, so the demo path
 * looks them up with a ~10-year freshness window instead of the 30-day result
 * cache used for real runs.
 */
const DEMO_REPLAY_MAX_AGE_DAYS = 3650

/**
 * Choisit un dossier d'exemple à partir du texte tapé — déterministe, pour que
 * la même saisie retombe toujours sur le même dossier (une démo doit se
 * rejouer à l'identique devant un prospect, deux fois de suite).
 *
 * Somme de caractères plutôt qu'un vrai hash : rien ici n'a besoin d'être
 * imprévisible, seulement stable.
 */
export function demoDossierIndex(companyName: string, count: number): number {
  if (count <= 0) return -1
  let sum = 0
  for (const char of companyName.trim().toLowerCase()) sum += char.codePointAt(0) ?? 0
  return sum % count
}

/**
 * Lookup window for an EXPLICIT relaunch of a completed dossier. A relaunch
 * re-runs the pipeline IN PLACE on the existing account whatever its age (the
 * 30-day result cache only governs the fast "ouvrir" cache-hit, never the
 * relaunch), so we must find the completed row even when it's long stale — hence
 * an effectively-unbounded window rather than the cache freshness cutoff.
 */
const RELAUNCH_COMPLETED_MAX_AGE_DAYS = 3650

@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name)

  constructor(
    @InjectQueue('analysis') private readonly analysisQueue: Queue<AnalysisJobData>,
    private readonly accountsService: AccountsService,
    private readonly contactsService: ContactsService,
    private readonly cancellation: AnalysisCancellationService,
    private readonly esnProfile: EsnProfileReader,
    private readonly credits: CreditsService,
    private readonly runs: AnalysisRunsService,
    private readonly persistence: AnalysisPersistenceService,
    // Product analytics — best-effort, `@Optional()` so unit specs keep working
    // without the (global) AnalyticsModule in their testing module.
    @Optional() private readonly analytics?: ProductAnalyticsService,
    // Target-market resolver — `@Optional()` for the same reason. Absent (unit
    // specs) ⇒ no `country` is resolved ⇒ the FR default path is untouched.
    @Optional() private readonly market?: WorkspaceMarketService,
    // Mémoire de corrections (feedback loop A2) — `@Optional()` pour la même
    // raison. Absent (unit specs) ⇒ aucun bloc résolu ⇒ payload inchangé.
    @Optional() private readonly accountFeedback?: AccountFeedbackService,
    // Demo-mode guard (C1) — `@Optional()` for the same reason. Absent (unit
    // specs) ⇒ no demo check ⇒ the real-analysis path is untouched. Wired in
    // AnalysisModule (WorkspaceModule is already imported).
    @Optional() private readonly workspaceContext?: WorkspaceContextService,
    // Phase checkpoints — how `getStatus` answers "where is this run?" from
    // state. `@Optional()` for the same reason as the others (unit specs build
    // this service without the outbox repo); absent ⇒ no checkpoint evidence ⇒
    // the status read degrades to the persisted-dossier estimate, never to a
    // fabricated percentage.
    @Optional() private readonly checkpoints?: AnalysisCheckpointReader,
    // Mémoire du graphe d'organigramme (Annexe Organigramme §5) — `@Optional()`
    // pour la même raison. Absent (unit specs) ⇒ aucune mémoire résolue ⇒ le
    // graphe est réassemblé comme avant (version 1, aucun rejet mémorisé).
    @Optional() private readonly orgGraph?: OrgGraphVersionService,
    // Couche zéro CRM (annexe méthodo p8) — `@Optional()` pour la même raison.
    // Absent (unit specs) ⇒ aucun relevé résolu ⇒ payload IA inchangé.
    @Optional() private readonly crmRead?: CrmReadService,
    // Couche zéro HORS CRM (p8 : ATS, Drive, e-mails, notes) — `@Optional()`
    // pour la même raison, et parce qu'aucune de ces intégrations n'est requise.
    @Optional() private readonly zeroLayer?: ZeroLayerService,
    // Boucle d'apprentissage (§6) — l'agrégat de ce que l'ÉQUIPE a fait des
    // besoins passés. `@Optional()` pour la même raison que les autres : absent
    // (unit specs) ⇒ aucun bloc résolu ⇒ payload IA inchangé.
    @Optional() private readonly opportunities?: ProjectsService,
    // Axe CHEMIN (#1631.3/.4, lot 14) — `@Optional()` pour la même raison que
    // ses voisins. Absent (unit specs) ⇒ aucun axe résolu ⇒ job byte-identique.
    // Ajouté en DERNIER : un optionnel inséré au milieu décale les specs qui
    // construisent ce service positionnellement.
    //
    // ⚠️ GA-07 (10/09/2026, `feat/lot-vague2-2026-09-10`) : ce paramètre pointait
    // `MarketMemoryService` importé DIRECTEMENT de `../market-memory/…` — un
    // import service → service de plus, le cliquet est remonté de 254 à 256.
    // Le jeton `MARKET_PATH_AXIS_SOURCE` (voir `./market-path-axis-source.ts`)
    // inverse la dépendance : ce fichier ne connaît plus le nom de
    // `MarketMemoryService`, seul `analysis.module.ts` (exclu du balayage) le
    // branche. Comportement inchangé — même méthode, même signature.
    @Optional() @Inject(MARKET_PATH_AXIS_SOURCE) private readonly marketMemory?: MarketPathAxisSource,
    // Axe RELATION (#2298.4, lot 19/09) — `@Optional()` pour la même raison
    // que ses voisins. Absent (unit specs) ⇒ aucune source résolue ⇒ job
    // byte-identique. Ajouté en DERNIER, même discipline que `marketMemory`
    // juste au-dessus : un optionnel inséré au milieu décale les specs qui
    // construisent ce service positionnellement.
    @Optional() private readonly relationAxis?: RelationAxisReaderService,
    @Optional() private readonly channelPerformanceReader?: ChannelPerformanceReaderService,
    // #3753.3 — le ciblage de l'ESN sur ce compte (hypothèses du vendeur). `@Optional()`
    // comme ses voisins ; ajouté en DERNIER pour ne pas décaler les specs positionnelles.
    @Optional() private readonly sellerHypothesesReader?: SellerHypothesesReader,
    // #3623 — les pièces jointes rattachées au compte avant la mise en file. Optionnel, EN FIN.
    @Optional() private readonly attachmentBinder?: AnalysisAttachmentBinderService,
    // #4070 — les lectures que le lancement ajoute au job : faits du compte (socle #4069),
    // interlocuteurs connus, analyse précédente. Optionnel, EN FIN, comme ses voisins : absent
    // (specs unitaires, déploiement sans le module) ⇒ aucune clé ⇒ job byte-identique.
    @Optional() private readonly factsInputs?: AnalysisFactsInputsService,
  ) {}

  /**
   * #4070 — ce que le socle des faits du compte (#4069) ajoute au job d'analyse.
   *
   * Le lecteur est UNIQUE (`AccountFactsService`, derrière le jeton du module) : ni ici ni
   * dans le worker on n'en écrit un second. Chaque clé est omise quand elle est vide, donc
   * un compte sans historique lance un run byte-identique à avant le lot.
   *
   * - « Neutre » (aucune couche) : rien n'est lu, rien ne part — l'utilisateur a demandé une
   *   analyse sans l'historique de son espace. Le CRM a sa propre couche (`crm`).
   * - Sans espace sur le compte (legacy) : on ne devine pas un espace, rien n'est lu.
   * - Les contacts du CRM ne sont demandés QUE si le CRM a déjà reconnu le compte
   *   (`crmPresence` non vide) : pas d'appel réseau de plus pour un compte inconnu.
   */
  private async resolveFactsInputs(
    account: { id: string; workspace_id?: string | null; company_name: string; website?: string | null },
    userId: string,
    opts: { contextMode: LauraContextMode; crmPresence: string | undefined; siren?: string | null },
  ): Promise<{
    accountFacts?: AnalysisAccountFact[]
    knownContacts?: AnalysisKnownContact[]
    previousAnalysis?: string
    lostDealRex?: string
  }> {
    const workspaceId = account.workspace_id
    if (!this.factsInputs || !workspaceId) return {}
    if (contextModeExcludes(opts.contextMode, 'commercial_history')) return {}
    const scope = { workspaceId, accountId: account.id, userId }
    const crmContacts =
      opts.crmPresence && this.crmRead && !contextModeExcludes(opts.contextMode, 'crm')
        ? this.crmRead.knownContacts(userId, {
            companyName: account.company_name,
            website: account.website ?? null,
            siren: opts.siren ?? null,
          })
        : Promise.resolve([])
    const [facts, missionContacts, previousAnalysis, fromCrm] = await Promise.all([
      this.factsInputs.accountFacts(scope),
      this.factsInputs.missionContacts(scope),
      this.factsInputs.previousAnalysis(scope),
      crmContacts,
    ])
    const knownContacts = mergeKnownContacts(knownContactsFromCrm(fromCrm), missionContacts)
    return {
      ...facts,
      ...(knownContacts.length > 0 ? { knownContacts } : {}),
      ...(previousAnalysis ? { previousAnalysis } : {}),
    }
  }

  /**
   * #3753.3 — le ciblage fourni par l'ESN sur ce compte, ou `undefined`. « Neutre »
   * (#2453) l'écarte comme l'historique commercial : c'est une donnée de l'espace.
   */
  private async resolveSellerHypotheses(
    account: { id?: string; workspace_id?: string | null },
    contextMode: LauraContextMode = DEFAULT_LAURA_CONTEXT_MODE,
  ): Promise<SellerHypothesesForRun | undefined> {
    if (!this.sellerHypothesesReader || !account.id) return undefined
    if (contextModeExcludes(contextMode, 'commercial_history')) return undefined
    return this.sellerHypothesesReader.forAccount(account.id, account.workspace_id)
  }

  /**
   * The seller's ESN profile that conditions the whole run (offers, sectors,
   * size, geo → strategy/plan prompts). Derived server-side from the stored
   * onboarding questionnaire so the web/worker never has to send or spoof it,
   * and so ``resume`` re-derives the same profile instead of running blind.
   * An unanswered questionnaire yields ``{}`` → a deliberate profile-neutral run.
   */
  private async resolveProfileData(userId: string): Promise<AnalysisProfileData> {
    return this.esnProfile.resolveProfileData(userId)
  }

  /**
   * La provenance du profil de ce run : personnalisé ou générique, avec quelle
   * version, et pourquoi (recette finale §13/§53 — P0-02).
   *
   * Le calcul est déterministe et vit dans `@bellum/contracts`, pas ici : le
   * même verdict doit être lisible par l'écran qui l'affiche et par le test qui
   * le vérifie, sans qu'aucun des deux ne le recalcule à sa façon.
   *
   * `overridden` couvre le cas de l'appelant qui impose un profil (opérateur,
   * démo) : le run est alors générique pour une raison qui n'est PAS un oubli
   * de l'utilisateur, et l'écrire évite d'accuser quelqu'un à tort.
   *
   * Best-effort intégral : si la lecture des versions échoue, on rend une
   * provenance sans version plutôt que rien. Une provenance partielle explique
   * encore le mode ; une provenance absente laisse l'écran muet, c'est-à-dire
   * exactement le défaut que le rapport reproche.
   */
  private async resolveProfileProvenance(
    userId: string,
    overridden: boolean,
    contextMode: LauraContextMode = DEFAULT_LAURA_CONTEXT_MODE,
  ): Promise<RecordedRunProfileProvenance> {
    let answers: EsnAnswers | null = null
    try {
      answers = await this.esnProfile.getAnswers(userId)
    } catch (error) {
      this.logger.warn('Profile provenance: answers unreadable, run treated as generic', {
        error: error instanceof Error ? error.message : String(error),
        userId,
      })
    }

    // #2453.8 — un mode qui a écarté le profil rend le run générique PAR CHOIX :
    // aucun score ne se dira « à ton activité », et l'écran ne pousse pas à
    // compléter un profil qui peut l'être déjà.
    const verdict =
      !overridden && contextModeExcludes(contextMode, 'profile')
        ? {
            ...resolveRunProfileMode({ answers, overridden }),
            mode: 'generic' as const,
            reason: 'context_mode' as const,
          }
        : resolveRunProfileMode({ answers, overridden })
    // Les révisions appartiennent au lecteur de profil, qui possède les dépôts ;
    // elles dégradent déjà en `null` plutôt que de lever — un run doit pouvoir
    // partir sans savoir numéroter son profil.
    const versions = (await this.esnProfile.getProfileVersions?.(userId).catch(() => null)) ?? {
      esnProfileVersion: null,
      profileContextVersion: null,
    }
    // #2005.11 — les versions des TROIS couches (entreprise · BU · personne).
    // Illisibles, les trois clés restent là et valent `null` : on ne sait pas,
    // on ne devine pas — et l'écriture exige les trois clés.
    const layerVersions = (await this.esnProfile.getLayerVersions?.(userId).catch(() => null)) ?? {
      company: null,
      businessUnit: null,
      person: null,
    }
    return {
      mode: verdict.mode,
      reason: verdict.reason,
      answered: verdict.answered,
      required: verdict.required,
      esnProfileVersion: versions.esnProfileVersion,
      profileContextVersion: versions.profileContextVersion,
      esnName: verdict.mode === 'personalised' ? answers?.esn_name?.trim() || null : null,
      layerVersions,
      contextMode,
    }
  }

  /**
   * Le bloc « directives de correction » du compte (feedback loop A2) — la
   * mémoire des retours utilisateur du workspace sur CETTE entreprise, condensée
   * déterministiquement, réinjectée au run comme le profil. `undefined` quand il
   * n'y a aucun feedback (ou pas de service en unit spec) → payload inchangé.
   * Best-effort : `directivesFor` dégrade déjà en `''` sur erreur de lecture —
   * la mémoire ne bloque jamais un lancement.
   */
  private async resolveAccountFeedback(account: {
    id: string
    workspace_id?: string | null
    company_name: string
  }): Promise<string | undefined> {
    if (!this.accountFeedback) return undefined
    const directives = await this.accountFeedback.directivesFor({
      accountId: account.id,
      workspaceId: account.workspace_id ?? null,
      companyName: account.company_name,
    })
    return directives || undefined
  }

  /**
   * La mémoire du graphe d'organigramme pour ce run (Annexe Organigramme §5) :
   * la version courante et les éléments déjà écartés, pour que l'assembleur ne
   * réinjecte jamais un contact rejeté et reparte de la bonne version.
   * `undefined` quand il n'y a rien à se rappeler (ou pas de service en unit
   * spec) → l'assemblage IA est byte-identique à avant la feature.
   */
  private async resolveOrgGraphMemory(account: {
    id: string
    workspace_id?: string | null
    company_name: string
  }): Promise<{ orgGraphVersion?: number; orgRejectedItems?: Array<{ sourceId: string; reason: string }> }> {
    if (!this.orgGraph) return {}
    const memory = await this.orgGraph.memoryFor({
      accountId: account.id,
      workspaceId: account.workspace_id ?? null,
      companyName: account.company_name,
    })
    return {
      ...(memory.graphVersion > 1 ? { orgGraphVersion: memory.graphVersion } : {}),
      ...(memory.rejectedItems.length > 0 ? { orgRejectedItems: memory.rejectedItems } : {}),
    }
  }

  /**
   * Couche zéro de la méthodologie de vente (annexe p8 : « Bellum doit toujours
   * chercher ce qui EXISTE avant de proposer du froid »). Interroge le CRM
   * connecté de l'ESN sur ce compte et rend le relevé au run — c'est ce qui
   * empêche le plan de recommander une approche froide sur un compte où
   * l'entreprise a déjà un historique.
   *
   * `undefined` sans service (unit specs), sans CRM connecté (cas par défaut,
   * ZÉRO appel réseau) ou sans match : la clé n'est alors pas envoyée à l'IA et
   * le run est byte-identique à ce qu'il était avant la feature.
   */
  private async resolveCrmPresence(
    account: {
      company_name: string
      website?: string | null
      siren?: string | null
      relationship_memory?: RelationshipMemory | null
    },
    userId: string,
  ): Promise<string | undefined> {
    const crmText = this.crmRead
      ? await this.crmRead.describeAccountHistory(userId, {
          companyName: account.company_name,
          website: account.website ?? null,
          siren: account.siren ?? null,
        })
      : undefined
    // Mémoire de relation (bloc « Mémoire » couche zéro, annexe p8) — ce que le
    // commercial a saisi sur ce compte, relu au run suivant pour enrichir la
    // couche zéro. Fusionnée au texte CRM (les deux nourrissent `zero_layer_block`
    // côté IA). Rien à ajouter quand aucune mémoire n'est saisie.
    const memoryText = formatRelationshipMemory(account.relationship_memory)
    return [crmText, memoryText].filter(Boolean).join('\n\n') || undefined
  }

  /**
   * Axe CHEMIN de l'adressabilité (#1631.3/.4, #1606.2, lot 14 — même mirroir
   * que {@link resolveCrmPresence}) : le compte de parcours AGRÉGÉ que la
   * mémoire marché a observés vers ce compte, et l'ESN la plus observée pour
   * NOMMER la preuve (`_path_axis` côté IA). `MarketMemoryService` est la
   * SEULE porte vers les tables partagées (GA-258) — `pathAxisFor` est sa
   * dérivation dédiée, réutilisée telle quelle plutôt que refaite ici.
   *
   * `{}` sans service (specs à constructeur nu), sans couverture, ou sous le
   * seuil transverse : le job reste alors byte-identique à avant ce lot, et
   * l'axe `path` reste NON MESURÉ côté IA — jamais un `0`.
   */
  private async resolveMarketPathAxis(
    account: { company_name: string; website?: string | null; registry_country?: string | null },
    accountId: string,
  ): Promise<{ marketPathsObserved?: number; marketTopEsn?: string }> {
    if (!this.marketMemory) return {}
    const axis = await this.marketMemory.pathAxisFor({
      ref: accountId,
      name: account.company_name,
      website: account.website ?? null,
      country: account.registry_country ?? null,
    })
    if (!axis) return {}
    return { marketPathsObserved: axis.paths, ...(axis.topEsn ? { marketTopEsn: axis.topEsn } : {}) }
  }

  /**
   * #2298.4 (décision Louis 19/09/2026) — les QUATRE sources ajoutées à
   * l'axe RELATION (`_relation_axis` côté IA) en plus du CRM
   * (`resolveCrmPresence`, déjà branché) : missions signées, dernier
   * rendez-vous (agenda), derniers échanges e-mail (MÉTADONNÉES — une date,
   * jamais le corps) et une correction humaine.
   *
   * Les trois premières viennent de `RelationAxisReaderService` (missions +
   * activités — voir son docstring pour la raison de son isolement). La
   * QUATRIÈME (`human_correction`) est lue directement sur `account` : la
   * mémoire de relation (`relationship_memory.relation`) est DÉJÀ portée par
   * l'objet compte que ce service reçoit partout ailleurs — aucun service de
   * plus pour une lecture de champ.
   *
   * `{}` sans service (specs à constructeur nu) ou sans AUCUNE source réelle :
   * le job reste alors byte-identique à avant ce lot, et l'axe `relation`
   * reste NON MESURÉ côté IA quand le CRM non plus n'a rien trouvé — jamais
   * un `0`.
   */
  private async resolveRelationAxis(
    account: { relationship_memory?: RelationshipMemory | null },
    accountId: string,
  ): Promise<{
    relationMissionsCount?: number
    relationLastMeetingAt?: string
    relationLastEmailAt?: string
    relationHumanCorrection?: string
    declaredPartners?: string[]
    consultantHistory?: 'present' | 'former'
    declaredSignalPresent?: boolean
    partnerPlacementsActive?: number
    /** #3278.1 — veille / talent / événement / inbound (plan asynchrone). */
    routeSignals?: RouteSignals
    /** #3278.a — preuves / historique des canaux ({} = lu, rien trouvé). */
    accumulatedRouteCriteria?: AccumulatedRouteCriteria
  }> {
    const signals = this.relationAxis ? await this.relationAxis.relationSignalsFor(accountId) : {}
    const correction = account.relationship_memory?.relation?.trim()
    return {
      ...(signals.missionsCount ? { relationMissionsCount: signals.missionsCount } : {}),
      ...(signals.lastMeetingAt ? { relationLastMeetingAt: signals.lastMeetingAt } : {}),
      ...(signals.lastEmailAt ? { relationLastEmailAt: signals.lastEmailAt } : {}),
      ...(correction ? { relationHumanCorrection: correction } : {}),
      ...(signals.declaredPartners?.length ? { declaredPartners: signals.declaredPartners } : {}),
      ...(signals.consultantHistory ? { consultantHistory: signals.consultantHistory } : {}),
      ...(signals.declaredSignalPresent ? { declaredSignalPresent: signals.declaredSignalPresent } : {}),
      // #2371.4 — 10e stade « partenaire actif » (placements en cours, même SIREN).
      ...(signals.partnerPlacementsActive ? { partnerPlacementsActive: signals.partnerPlacementsActive } : {}),
      ...(signals.routeSignals ? { routeSignals: signals.routeSignals } : {}),
      ...(signals.accumulatedRouteCriteria ? { accumulatedRouteCriteria: signals.accumulatedRouteCriteria } : {}),
    }
  }

  /**
   * Couche zéro, hors CRM (annexe méthodo p8 : ATS, Drive, e-mails, notes, CV
   * envoyés). Rend le relevé des outils internes de l'ESN sur ce compte, ou
   * `undefined` quand il n'y a rien d'honnête à dire.
   *
   * `undefined` couvre : service absent (unit specs), aucune intégration
   * connectée (cas par défaut, ZÉRO appel réseau), aucune trouvaille, ou toutes
   * les sources en échec. La clé ne part alors pas à l'IA et le run est
   * byte-identique à ce qu'il était avant la feature.
   *
   * Best-effort de bout en bout : un Drive lent ou un ATS cassé ne doit JAMAIS
   * empêcher une analyse de partir.
   */
  private async resolveInternalHistory(
    account: { id?: string; company_name: string; website?: string | null; workspace_id?: string | null },
    userId: string,
  ): Promise<string | undefined> {
    if (!this.zeroLayer) return undefined
    try {
      return await this.zeroLayer.describeInternalHistory(userId, {
        companyName: account.company_name,
        domain: domainFromWebsite(account.website ?? null),
        // #1088 « il faudrait que Bellum puisse capitaliser pour enrichir » :
        // les notes écrites sur CE compte rejoignent le bloc de traces
        // internes. Compte sans identifiant (specs unitaires) ⇒ aucune note
        // lue, bloc byte-identique.
        accountId: account.id ?? null,
        workspaceId: account.workspace_id ?? null,
      })
    } catch (error) {
      this.logger.warn('Internal history lookup failed — the run proceeds without it', {
        error: error instanceof Error ? error.message : String(error),
        userId,
      })
      return undefined
    }
  }

  /**
   * Boucle d'apprentissage (restitution V2 §6 — « chaque analyse améliore la
   * base globale »).
   *
   * Ce que l'ÉQUIPE a fait des besoins passés (convertis / transformés en action
   * / déclarés obsolètes, par secteur et par offre) part avec le run, comme le
   * profil. C'est un PRIOR sur l'ESN, jamais un fait sur la cible.
   *
   * `undefined` quand rien n'a jamais été déplacé, quand le workspace est
   * inconnu, ou sur erreur : la clé est alors omise du wire et le prompt reste
   * byte-identique. Un apprentissage qui n'existe pas ne se devine pas.
   */
  private async resolveWorkspaceLearning(workspaceId: string | null | undefined): Promise<string | undefined> {
    if (!this.opportunities || !workspaceId) return undefined
    try {
      return renderWorkspaceLearning(await this.opportunities.summarizeLearning(workspaceId)) || undefined
    } catch (error) {
      this.logger.warn('Workspace learning lookup failed — the run proceeds without it', {
        error: error instanceof Error ? error.message : String(error),
        workspaceId,
      })
      return undefined
    }
  }

  /**
   * #3278.3 (#3259.7) — ce que l'espace a MESURÉ par canal, pour que le plan
   * cède le preset de méthode devant la performance réelle. `undefined` sans
   * lecteur, sans espace, sans aucun envoi mesurable ou sur erreur : la clé
   * est alors omise du wire (byte-identique). Une mesure absente ne se devine pas.
   */
  private async resolveChannelPerformance(
    workspaceId: string | null | undefined,
  ): Promise<ChannelPerformance[] | undefined> {
    if (!this.channelPerformanceReader || !workspaceId) return undefined
    try {
      const rows = await this.channelPerformanceReader.forWorkspace(workspaceId)
      return rows.length > 0 ? rows : undefined
    } catch (error) {
      this.logger.warn('Channel performance lookup failed — the run proceeds without it', {
        error: error instanceof Error ? error.message : String(error),
        workspaceId,
      })
      return undefined
    }
  }

  /**
   * #3278.3 — la MÊME mesure que `resolveChannelPerformance`, lue pour Laura
   * (outil `get_channel_performance`). Contrairement au lancement d'analyse,
   * une panne de lecture n'est PAS dégradée en « rien mesuré » : Laura doit
   * dire qu'elle n'a pas pu lire, pas affirmer une absence de données.
   */
  async channelPerformanceFor(workspaceId: string): Promise<ChannelPerformance[]> {
    if (!this.channelPerformanceReader) return []
    return this.channelPerformanceReader.forWorkspace(workspaceId)
  }

  /** #3234 (#3211.11) — la même mesure, par rôle de décision ; même règle de panne (jamais « rien mesuré »). */
  async rolePerformanceFor(workspaceId: string): Promise<RolePerformance[]> {
    if (!this.channelPerformanceReader) return []
    return this.channelPerformanceReader.byRoleForWorkspace(workspaceId)
  }

  /** #3211.11 (lot RAISON-B) — la même mesure, par angle du message ; même règle de panne (jamais « rien mesuré »). */
  async anglePerformanceFor(workspaceId: string): Promise<AnglePerformance[]> {
    if (!this.channelPerformanceReader) return []
    return this.channelPerformanceReader.byAngleForWorkspace(workspaceId)
  }

  /** #3211.11 (#3234, lot M11) — recommandation par dimension ; `null` = lecteur absent (jamais « rien de mesuré »). */
  async outcomeRecommendationFor(
    workspaceId: string,
    dimension: OutcomeRecommendationDimension,
  ): Promise<OutcomeRecommendation | null> {
    if (!this.channelPerformanceReader) return null
    return this.channelPerformanceReader.outcomeRecommendationFor(workspaceId, dimension)
  }

  /**
   * The `country` code to hand the IA for a run in `workspaceId`, or `undefined`
   * for the FR default (which must leave the French wire/pipeline untouched).
   * Returns `undefined` when the market resolver is absent (unit specs), the
   * workspace is unknown, the market is FR, or the lookup fails — every path
   * degrades to FR rather than blocking or guessing a foreign market.
   */
  private async resolveRunCountry(workspaceId: string | null): Promise<string | undefined> {
    return (await this.resolveRunCountryOutcome(workspaceId)).country
  }

  /**
   * The same resolution, saying whether it was READ (#2288.4). `start()` only
   * needs the country and degrades a failed lookup to FR; the launch preview
   * (`forecastPublicTenders`) must not promise what that fallback implies.
   * No resolver wired ⇒ the run sends no country: that is a known FR, not a
   * failure.
   */
  private async resolveRunCountryOutcome(
    workspaceId: string | null,
  ): Promise<{ country: string | undefined; resolved: boolean }> {
    if (!this.market) return { country: undefined, resolved: true }
    try {
      const { countryCode } = await this.market.resolveForWorkspace(workspaceId)
      return { country: countryCode === 'FR' ? undefined : countryCode, resolved: true }
    } catch (error) {
      this.logger.warn('Market resolution failed — falling back to the FR default', {
        workspaceId,
        error: error instanceof Error ? error.message : String(error),
      })
      return { country: undefined, resolved: false }
    }
  }

  /**
   * Server-of-truth view of an analysis: looks up the BullMQ job and combines
   * it with persisted DB state to estimate progress. The frontend uses this
   * to rejoin an analysis that started on another tab — Socket.IO events
   * overwrite the estimate as soon as they arrive.
   */
  async getStatus(
    accountId: string,
    userId: string,
    scope?: AnalysisAccountScope,
  ): Promise<Result<AnalysisStatusResult, AnalysisFailure>> {
    // #2704 — le compte d'une analyse appartient à l'ESPACE, pas à celui qui a
    // cliqué : sans ça, le coéquipier qui rouvrait l'onglet recevait 404 et son
    // écran restait sur « Analyse en cours », 0 %, sans message.
    const account = await this.findAccountForCaller(accountId, userId, scope)
    if (!account) {
      return failure({ code: 'not_found', message: `Account ${accountId} not found` })
    }
    // #2704 — le run appartient à son LANCEUR. Tout ce qui suit (identifiant de
    // tâche, lectures et écritures bornées par `user_id`, remboursement) se
    // rattache à lui, jamais à l'appelant courant. Quand les deux sont la même
    // personne — tous les chemins qui fonctionnaient avant —, c'est byte pour
    // byte le comportement d'hier.
    const ownerId = account.user_id

    // #2704.8 — le SIREN doit voyager ici aussi : `start()` le suffixe pour un
    // run à périmètre verrouillé (deux sociétés homonymes, cf. #2704.7), et un
    // statut reconstruit SANS lui visait un jobId que la file n'a jamais eu.
    const jobId = this.buildJobId(ownerId, account.company_name, account.siren ?? undefined)
    const job = await this.analysisQueue.getJob(jobId)
    const jobState = job ? await job.getState() : null

    const state: AnalysisStatusResult['state'] =
      jobState === 'completed'
        ? 'completed'
        : jobState === 'failed'
          ? 'failed'
          : (ACTIVE_JOB_STATES as readonly string[]).includes(jobState ?? '')
            ? 'active'
            : 'not_found'

    if (account.status === 'completed') {
      return success({
        jobId,
        state: 'completed',
        percent: 100,
        phase: 'analysis_done',
        completedPhases: [...PROGRESS_PHASES],
        entityAmbiguity: this.entityAmbiguityOf(account),
      })
    }
    if (account.status === 'error') {
      // #2478 — « les analyses échouent presque à chaque fois et en plus
      // c'est faux, une grande partie a fonctionné ». `completedPhases`
      // rendait `[]` en DUR ici : un run mort en phase `plan` après avoir
      // checkpointé `research` et `contacts` se lisait comme un échec TOTAL,
      // alors que l'outbox sait exactement ce qui a abouti (même lecture que
      // le chemin `not_found`/`active` plus bas — la seule différence est
      // l'ÉTAT terminal, pas la vérité des phases déjà commises).
      const runStartedAt = await this.runs.latestStartedAt(accountId)
      const completedPhases = await this.loadCheckpointedPhases(accountId, jobId, runStartedAt)
      return success({ jobId, state: 'failed', percent: 0, phase: null, completedPhases })
    }
    if (account.status === 'canceled') {
      return success({ jobId, state: 'canceled', percent: 0, phase: null, completedPhases: [] })
    }

    // Lot D01 (06/10/2026) — salle de démonstration : le compte semé « en cours d'analyse »
    // (#3666) n'a aucun job. On répond « en cours » SANS pourcentage ni phase inventés, au
    // lieu de le réparer en erreur (et de rembourser un crédit qui n'a jamais été débité).
    if (
      state === 'not_found' &&
      account.status === 'analyzing' &&
      this.workspaceContext &&
      (await this.workspaceContext.isDemoWorkspace(userId))
    ) {
      return success({ jobId, state: 'active', percent: null, phase: null, completedPhases: [] })
    }

    // Opportunistic self-heal (companion to the periodic StuckAnalysisReaper): the
    // DB still says `analyzing`, but no job can still report on it and the row is
    // older than the worker's hard job ceiling — so the worker died mid-run (Redis
    // eviction / redeploy) without ever firing its terminal event. Repair it in
    // place the moment the account is opened so the caller sees a clean failure
    // (with a resume CTA) instead of a phantom progress bar that never resolves.
    //
    // `not_found` alone was too narrow, and the gap was the common case rather
    // than an edge one: a worker killed mid-job leaves the job `active` in Redis
    // forever (nothing is left to run BullMQ's stalled-check), so `state` reads
    // `active` and the self-heal never ran — on precisely the accounts it exists
    // to repair. An orphaned job counts as no job.
    if (
      (state === 'not_found' || (job !== null && job !== undefined && isOrphanedJob(job))) &&
      isStaleAnalyzing(account)
    ) {
      // Transition GARDÉE : ce compte peut être réparé en parallèle par le
      // faucheur périodique (qui atteint désormais les MÊMES lignes, un job
      // orphelin ne comptant plus comme vivant) ou par la relance. Seul le
      // gagnant rembourse — sinon le crédit serait rendu plusieurs fois pour un
      // seul run mort.
      const won = await this.accountsService.markInterrupted(accountId, ANALYSIS_INTERRUPTED_MESSAGE)
      if (won) {
        await this.runs.completeLatest(accountId, { status: 'error' })
        // Le run est mort sans rien produire : rendre le crédit d'analyse
        // (règle Théo §7 « rembourser si échec non utilisateur »). Le worker ne
        // peut pas le faire ici — c'est justement le cas où il n'a jamais émis
        // d'événement terminal. Best-effort : un échec de facturation ne doit
        // pas empêcher l'utilisateur de voir un état propre + le CTA « Reprendre ».
        // #2704 — rendu à QUI a été débité (le lanceur), jamais à qui lit.
        await this.refundInterruptedRun(ownerId, accountId, `réparation à la lecture: ${account.company_name}`)
        this.logger.warn('Repaired stuck analyzing account on read (no live job past job ceiling)', {
          accountId,
          userId: ownerId,
        })
      }
      return success({ jobId, state: 'failed', percent: 0, phase: null, completedPhases: [] })
    }

    // Where is this run, *from state*? Phase checkpoints are the record: a row
    // exists iff that phase's data write committed. The Socket.IO stream is an
    // accelerator for live updates — an absence of events says nothing about the
    // work, so it must never be read as "0%".
    const runStartedAt = await this.runs.latestStartedAt(accountId)
    const completedPhases = await this.loadCheckpointedPhases(accountId, jobId, runStartedAt)
    const checkpointed = progressFromPhases(completedPhases)
    if (checkpointed) {
      return success({ jobId, state, ...checkpointed, completedPhases })
    }

    // No checkpoint yet (phase 1 still running, or a run older than the outbox).
    // Fall back to what the persisted dossier itself proves, and return `null`
    // rather than a floor when it proves nothing.
    // #2704 — les contacts du dossier se lisent au nom du LANCEUR : bornés à
    // l'appelant, ils rendaient une liste vide et la position estimée retombait
    // à « phase 1 » sur un run déjà avancé.
    const contacts = await this.contactsService.findByAccount(accountId, ownerId)
    const estimate = estimateProgress(account, contacts.length, runStartedAt)
    return success({
      jobId,
      state,
      percent: estimate?.percent ?? null,
      phase: estimate?.phase ?? null,
      completedPhases,
    })
  }

  /**
   * #2283.32 — lit `raw_analysis.entity_resolution` (#2284) sur un compte dont
   * l'analyse est terminée : `null` sauf verdict `ambiguous`, jamais deviné.
   * Seuls les candidats porteurs d'un SIREN sont retenus — le même filtre que
   * `AnalysisBatchesService.resolveOne` applique déjà à la résolution de nom.
   */
  private entityAmbiguityOf(account: AccountEntity): { candidates: AnalysisBatchCandidate[] } | null {
    const resolution = readEntityResolution(account.raw_analysis)
    if (resolution?.state !== 'ambiguous') return null
    const candidates: AnalysisBatchCandidate[] = (resolution.question?.candidates ?? [])
      .filter((candidate): candidate is typeof candidate & { siren: string } => Boolean(candidate.siren))
      .map(candidate => ({ name: candidate.name, siren: candidate.siren, city: candidate.city ?? null }))
    return { candidates }
  }

  /** Phase checkpoints for this run, ordered. Best-effort: the reader is
   *  `@Optional()` (absent in unit specs) and a lookup failure must degrade to
   *  "unknown position" rather than break the status read the UI depends on to
   *  discover that a run has finished. */
  private async loadCheckpointedPhases(accountId: string, jobId: string, runStartedAt: Date | null): Promise<string[]> {
    if (!this.checkpoints) return []
    try {
      // Bornés au run COURANT — sans quoi une relance lisait les points de
      // contrôle du run précédent (le `jobId` est déterministe) et le dossier
      // s'affichait « Progression 100 % » sur un run qui venait de démarrer.
      const phases = await this.checkpoints.loadCompletedPhaseNames(accountId, jobId, runStartedAt)
      return PROGRESS_PHASES.filter(p => phases.includes(p))
    } catch (error) {
      this.logger.warn('Could not read phase checkpoints for status — reporting an unknown position', {
        accountId,
        jobId,
        error: error instanceof Error ? error.message : String(error),
      })
      return []
    }
  }

  /**
   * Le dossier d'exemple montré quand la saisie d'un visiteur de la démo ne
   * correspond à aucun dossier seedé. Déterministe (voir
   * {@link demoDossierIndex}) ; `null` quand l'espace démo n'a aucun dossier.
   */
  private async pickDemoDossier(userId: string, companyName: string): Promise<{ id: string } | null> {
    const dossiers = await this.accountsService.listCompletedForDemoReplay(userId)
    const index = demoDossierIndex(companyName, dossiers.length)
    return index >= 0 ? (dossiers[index] ?? null) : null
  }

  /**
   * #1583 — lecture seule, AUCUN débit : ce que `start()` ferait s'il était
   * appelé maintenant avec ces mêmes paramètres. Lit exactement les DEUX
   * mêmes signaux, dans le MÊME ordre que `start()` — démo avant tout (aucun
   * débit possible en démo, même si un dossier récent existe), puis le cache
   * de résultat — pour que l'aperçu ne puisse jamais diverger du réel.
   *
   * Le coût `fresh` vient de `resolveAnalysisCost`, la fonction que
   * `consumeAnalysisSlot` appelle pour DÉBITER — jamais de
   * `estimateAnalysisCredits` (grille miroir côté contrat) : une seule
   * fonction lue des deux côtés élimine la possibilité même d'un écart.
   */
  async planLaunch(
    params: { companyName: string; siren?: string; scopeMode?: AnalysisScopeMode; relaunch?: boolean },
    userId: string,
  ): Promise<AnalysisLaunchPlan> {
    if (this.workspaceContext && (await this.workspaceContext.isDemoWorkspace(userId))) {
      return { scenario: 'demo' }
    }
    const cached = await this.accountsService.findCompletedByUserAndCompany(userId, params.companyName, {
      siren: params.siren,
    })
    // SIMON-FIX S.18 — « Actualiser » est une relance EXPLICITE : `start()` saute alors le cache de
    // résultat (`dto.relaunch`) et DÉBITE. L'aperçu fait pareil, sinon il annonce « aucun crédit »
    // pour un geste qui en coûte 10 (recette Simon 20/10 : 1124 → 1114).
    if (cached && params.relaunch !== true) {
      return { scenario: 'cache_hit', accountId: cached.id, companyName: cached.company_name }
    }
    // #2292.17/.18 — le nom peut résoudre un dossier déjà analysé, QUEL QUE
    // SOIT SON ÂGE (même lecture que `forecastPublicTenders` ci-dessous,
    // partagée pour ne pas payer une seconde requête « connue »).
    const known = await this.accountsService.findCompletedByUserAndCompany(userId, params.companyName, {
      siren: params.siren,
      maxAgeDays: RELAUNCH_COMPLETED_MAX_AGE_DAYS,
    })
    // Théo B r1-recherche.A12 — même lecture, même test de péremption que la couche d'idempotence de `start()` :
    // un `analyzing` fantôme ne s'annonce pas, il serait réparé au lancement.
    const live = await this.accountsService.findAnalyzingByUserAndCompany(userId, params.companyName, {
      siren: params.siren,
    })
    const inFlight = live && !isStaleAnalyzing(live) ? live : null
    const startedBy = inFlight ? await this.startedByAuthor(inFlight, userId) : null
    return {
      scenario: 'fresh',
      credits: resolveAnalysisCost(params.scopeMode),
      depths: await this.depthOptions(params.scopeMode, userId),
      publicTenderSources: await this.forecastPublicTendersFor(known, userId),
      ...(known ? { knownAccount: { accountId: known.id, companyName: known.company_name } } : {}),
      ...(inFlight
        ? {
            inFlight: {
              accountId: inFlight.id,
              companyName: inFlight.company_name,
              ...(startedBy ? { startedBy } : {}),
            },
          }
        : {}),
    }
  }

  /**
   * #3944 (retour bêta Louis 08/10/2026) — les DEUX paliers annoncés AVANT le
   * clic (`SELECTABLE_ANALYSIS_RUN_DEPTHS`, plus `verified`, qui n'est plus un
   * choix — voir sa docstring). Coût par `resolveAnalysisCost` (la fonction du
   * débit), pages par `ANALYSIS_DEPTH_PRESETS`, durée = médiane des runs
   * terminés de l'espace (`null` tant qu'il y en a moins de trois : « non
   * mesurée », jamais inventée).
   */
  private async depthOptions(scopeMode: AnalysisScopeMode | undefined, userId: string) {
    let medians: Record<AnalysisRunDepth, number | null> = { quick: null, verified: null, deep: null }
    try {
      if (this.workspaceContext) {
        const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
        medians = await this.runs.medianSecondsByDepth(workspaceId)
      }
    } catch {
      // Lecture best-effort : un échec = « non mesurée », le devis s'affiche quand même.
    }
    return SELECTABLE_ANALYSIS_RUN_DEPTHS.map(depth => ({
      depth,
      credits: resolveAnalysisCost(scopeMode, 0, undefined, depth),
      pages: ANALYSIS_DEPTH_PRESETS[depth].pages,
      medianSeconds: medians[depth] ?? null,
    }))
  }

  /**
   * #2288.4 (c66, 18/09/2026) — CE QUE CE LANCEMENT INTERROGERA EN MARCHÉS
   * PUBLICS, dit AVANT le clic, et seulement quand c'est certain.
   *
   * La gate vit dans `collection_focus.py` (`plan_collection`) : BOAMP/DECP
   * sont écartés pour un pays cible hors France ou un archétype préliminaire
   * `international`/`startup`, calculé AU RUN depuis le gagnant du registre.
   * Deux morceaux de cette décision se lisent sans rien lancer, et ce sont les
   * seuls qu'on lit — `forecastPublicTenderSources` porte le reste :
   *  - le PAYS : `resolveRunCountryOutcome`, la fonction même que `start()`
   *    lit pour le run. Une lecture en échec n'annonce rien — le repli France
   *    du lanceur est une sûreté, pas un fait qu'un devis peut promettre ;
   *  - le NAF de l'entité que ce nom résout, déjà persisté par un run
   *    précédent (`accounts.naf_code`, horizon de relance et non de cache :
   *    un dossier de 40 jours est relancé, pas inconnu). Jamais vue ⇒ rien.
   *
   * Zéro appel réseau, aucun module de plus : `AccountsService` et
   * `WorkspaceMarketService` sont déjà les dépendances du lanceur.
   *
   * #2292.17/.18 — `known` est désormais résolu UNE fois par `planLaunch`
   * (qui en a aussi besoin pour `knownAccount`) et passé ici : GA-26, une
   * seule lecture « connue quel que soit l'âge » pour les deux usages.
   */
  private async forecastPublicTendersFor(
    known: AccountEntity | null,
    userId: string,
  ): Promise<ReturnType<typeof forecastPublicTenderSources>> {
    const knownNafCode = known?.naf_code ?? null
    if (!knownNafCode) return []
    const run = await this.resolveRunCountryOutcome(known?.workspace_id ?? null)
    if (!run.resolved) return []
    return forecastPublicTenderSources({ runCountry: run.country ?? null, knownNafCode })
  }

  /**
   * #2704.1 — qui a lancé un run qu'on REJOINT, quand ce n'est pas SOI : sans
   * ce nom, l'écran de la seconde personne restait muet sur la raison du
   * rattachement (Bedros/Adel, Apricot Labs, 22/09/2026).
   *
   * `null` = rien à nommer : c'est son propre run, `WorkspaceContextService`
   * est absent (specs historiques, `@Optional()`), ou une lecture a échoué —
   * fail-open, jamais un nom deviné, jamais un lancement bloqué pour ça.
   */
  private async startedByAuthor(account: AccountEntity, userId: string): Promise<WorkspaceAuthor | null> {
    if (!this.workspaceContext) return null
    if (!account.user_id || account.user_id === userId) return null
    try {
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
      return await this.accountsService.workspaceAuthorOf(workspaceId, account.user_id)
    } catch {
      return null
    }
  }

  /** L'espace actif de l'utilisateur, ou `null` : jamais un lancement bloqué pour une ligne d'historique. */
  private async activeWorkspaceIdOf(userId: string): Promise<string | null> {
    if (!this.workspaceContext?.resolveActiveWorkspace) return null
    try {
      return (await this.workspaceContext.resolveActiveWorkspace(userId)).workspaceId ?? null
    } catch {
      return null
    }
  }

  async start(
    dto: StartAnalysisDto,
    userId: string,
    // #2451.1 — `workspaceDefaultMode` : le défaut de l'ESPACE, résolu par le
    // CONTRÔLEUR (GA-07 : un service ne va pas chercher le service d'un autre
    // module). Absent = « Mon activité », le chemin d'avant ce réglage.
    opts: { force?: boolean; workspaceDefaultMode?: LauraContextMode } = {},
  ): Promise<Result<AnalysisStartResult, AnalysisFailure>> {
    // #4119 — le créneau se débite en plein milieu de `startClaiming`, puis une vingtaine de lectures et
    // d'écritures peuvent LEVER avant l'enfilage. Chaque sortie déjà prévue (échec typé, enfilage raté)
    // rend son crédit elle-même et baisse `held` ; ce filet ne rend donc QUE ce qui serait resté brûlé.
    const claim: SlotClaim = { held: false, cost: 0 }
    try {
      return await this.startClaiming(dto, userId, opts, claim)
    } catch (error) {
      if (claim.held) await this.releaseUnlaunchedSlot(userId, dto.company_name, claim)
      throw error
    }
  }

  private async releaseUnlaunchedSlot(userId: string, companyName: string, claim: SlotClaim): Promise<void> {
    try {
      // `cost` en repli : si le registre n'a pas de ligne rattachée, on rend le prix DÉBITÉ, pas le défaut.
      await this.credits.refundAnalysisSlot(userId, {
        reason: `échec lancement: ${companyName}`,
        cost: claim.cost,
        ...(claim.accountId ? { accountId: claim.accountId } : {}),
      })
      claim.held = false
      if (claim.accountId)
        await this.accountsService.markErrored(claim.accountId, "Impossible de lancer l'analyse. Réessaie.")
    } catch (refundError) {
      this.logger.warn('Failed to give back the analysis slot of a launch that threw', {
        accountId: claim.accountId,
        error: refundError instanceof Error ? refundError.message : String(refundError),
      })
    }
  }

  private async startClaiming(
    dto: StartAnalysisDto,
    userId: string,
    opts: { force?: boolean; workspaceDefaultMode?: LauraContextMode },
    claim: SlotClaim,
  ): Promise<Result<AnalysisStartResult, AnalysisFailure>> {
    const jobId = this.buildJobId(userId, dto.company_name, dto.siren)

    // Idempotency layer 1: BullMQ deterministic jobId. Catches the common case
    // (double-click, retry) where Redis still has the job in flight.
    const existing = await this.analysisQueue.getJob(jobId)
    if (existing) {
      const state = await existing.getState()
      // Un job `active` dont le worker est mort reste `active` dans Redis à jamais
      // (personne n'exécute plus le stalled-check). Sans ce garde, « Relancer »
      // retombait éternellement sur ce fantôme et renvoyait `in_flight` : le front
      // s'abonnait à un run qui n'émettra plus rien, et le compte était un
      // cul-de-sac que l'utilisateur ne pouvait pas quitter. Passé le plafond du
      // job, aucun événement terminal ne peut plus venir — le jobId est libéré et
      // une VRAIE analyse repart.
      if ((ACTIVE_JOB_STATES as readonly string[]).includes(state) && !isOrphanedJob(existing)) {
        this.logger.log('Reusing in-flight analysis job', {
          jobId,
          state,
          accountId: existing.data.accountId,
          userId,
          companyName: dto.company_name,
        })
        // Un run tourne pour de vrai → `launched: true`, le front s'abonne.
        return success({ jobId, accountId: existing.data.accountId, launched: true, reason: 'in_flight' })
      }
      // Terminal (completed/failed) ou orphelin : on libère le jobId pour qu'une
      // nouvelle analyse puisse démarrer. `remove()` peut refuser sur un job
      // encore verrouillé — ne jamais laisser ça bloquer le relancement.
      try {
        await existing.remove()
      } catch (err) {
        this.logger.warn('Could not remove a stale analysis job — starting a fresh run anyway', { jobId, error: err })
      }
    }

    // Idempotency layer 2: account row already in `analyzing` for this
    // (user, company). Closes the narrow race where two concurrent starts
    // both see `getJob === null`, each create an account row, then BullMQ
    // silently dedupes the second `queue.add`, leaving the second account
    // orphaned with status='analyzing' forever.
    const inFlightAccount = await this.accountsService.findAnalyzingByUserAndCompany(userId, dto.company_name, {
      siren: dto.siren,
    })
    if (inFlightAccount) {
      // …sauf si ce `analyzing` est un fantôme. Cette couche n'appliquait AUCUN
      // test de péremption : un compte laissé en `analyzing` par un worker mort
      // renvoyait `in_flight` à chaque tentative, indéfiniment. « Relancer »
      // ramenait donc l'utilisateur sur le run mort qu'il essayait justement de
      // fuir — le compte n'avait plus aucune sortie côté produit. On répare la
      // ligne (comme le fait déjà `getStatus` à la lecture) et on laisse une
      // vraie analyse démarrer.
      if (isStaleAnalyzing(inFlightAccount)) {
        // Transition GARDÉE + remboursement, comme les deux autres réparations.
        // Sans ça, ce chemin DOUBLE-FACTURE : le run mort garde son crédit et la
        // relance en consomme un second quelques lignes plus bas — 2 crédits pour
        // un seul dossier, sur le bouton même que l'utilisateur presse pour se
        // sortir d'une panne d'infra.
        const won = await this.accountsService.markInterrupted(inFlightAccount.id, ANALYSIS_INTERRUPTED_MESSAGE)
        if (won) {
          await this.runs.completeLatest(inFlightAccount.id, { status: 'error' })
          await this.refundInterruptedRun(
            userId,
            inFlightAccount.id,
            `relance après run interrompu: ${dto.company_name}`,
          )
        }
        this.logger.warn('Repaired a stale analyzing account on relaunch — starting a fresh run', {
          jobId,
          accountId: inFlightAccount.id,
          userId,
          companyName: dto.company_name,
        })
      } else {
        this.logger.log('Reusing existing analyzing account', {
          jobId,
          accountId: inFlightAccount.id,
          userId,
          companyName: dto.company_name,
        })
        // Le compte est en `analyzing` : un run est censé tourner → abonnement WS
        // légitime (le GC de staleness du store front couvre l'orphelin résiduel).
        // #2704.1 — quand ce n'est PAS l'appelant qui l'a lancé, on le nomme :
        // sans ça, la SECONDE personne se voit rattachée à un run sans savoir
        // pourquoi, ce qui se lit comme un plantage (Bedros/Adel, 22/09/2026).
        const startedBy = await this.startedByAuthor(inFlightAccount, userId)
        return success({
          jobId,
          accountId: inFlightAccount.id,
          launched: true,
          reason: 'in_flight',
          ...(startedBy ? { startedBy } : {}),
        })
      }
    }

    // Demo workspace (demo mode C1): NEVER launch the real pipeline (no IA
    // calls, no external-API spend, no credit movement). The analysis button
    // REPLAYS the seeded golden dossier when the company matches one, else
    // returns a clear demo_workspace failure. Placed before the quota claim so
    // a demo can never touch billing. `force` (operator, internal secret) is
    // exempt — it is how the seeded dossiers could be refreshed by an operator.
    if (!opts.force && this.workspaceContext && (await this.workspaceContext.isDemoWorkspace(userId))) {
      const seeded = await this.accountsService.findCompletedByUserAndCompany(userId, dto.company_name, {
        maxAgeDays: DEMO_REPLAY_MAX_AGE_DAYS,
      })
      // Le nom tapé ne correspond à aucun dossier seedé : on retombe sur UN des
      // dossiers d'exemple, choisi de façon déterministe (même saisie → même
      // dossier, une démo se rejoue à l'identique).
      //
      // Ce qu'on ne fait PAS, délibérément : fabriquer un dossier au nom de
      // l'entreprise tapée. Un prospect qui saisit « Société Générale » repartirait
      // avec des chiffres inventés sur une vraie boîte — c'est exactement la règle
      // « JAMAIS de données fictives ». Il voit donc un dossier d'exemple, sous son
      // vrai nom fictif, et le bandeau « Mode démo » reste affiché tout du long.
      const dossier = seeded ?? (await this.pickDemoDossier(userId, dto.company_name))
      if (dossier) {
        this.logger.log('Demo workspace — replaying a seeded dossier instead of launching a real analysis', {
          jobId,
          accountId: dossier.id,
          userId,
          companyName: dto.company_name,
          matched: Boolean(seeded),
        })
        // Aucun run ne tourne : la progression est jouée côté client (scriptée),
        // et `launched: false` empêche tout abonnement Socket.IO à un run absent.
        return success({ jobId, accountId: dossier.id, launched: false, reason: 'demo_replay' })
      }
      // Espace démo vide (seed jamais passé) : on le dit, plutôt que de laisser
      // croire à une analyse qui n'arrivera pas.
      this.logger.warn('Demo workspace — no seeded dossier at all to replay', { userId })
      return failure({
        code: 'demo_workspace',
        message: "Espace de démonstration : aucun dossier d'exemple n'est disponible pour le moment.",
      })
    }

    // « Ouvrir » vs « relancer » (compte canonique unique par entreprise).
    // Result cache (C1): a COMPLETED analysis for this same (workspace, company)
    // that's still fresh (< 30 days) is handed back as-is — a simple re-open /
    // ré-affichage — instead of launching a new run. Re-analyzing re-pays Brave +
    // Firecrawl + Pappers + Claude (~$0.65) for a dossier that hasn't materially
    // changed. Workspace-scoped inside the service — never another tenant.
    //
    // An EXPLICIT relaunch (`dto.relaunch`) is the opposite intent: refresh the
    // dossier IN PLACE on the SAME accountId (a new append-only AnalysisRun, one
    // credit) — NEVER a 2nd row. So a relaunch skips the cache-hit short-circuit,
    // finds the completed row whatever its age, and falls through to reuse it.
    // ``force`` (operator "fresh" launch) likewise bypasses the cache to re-run.
    const relaunch = !opts.force && dto.relaunch === true
    const cached = opts.force
      ? null
      : await this.accountsService.findCompletedByUserAndCompany(userId, dto.company_name, {
          siren: dto.siren,
          // Relance : retrouver le dossier même périmé pour le ré-exécuter en place.
          ...(relaunch ? { maxAgeDays: RELAUNCH_COMPLETED_MAX_AGE_DAYS } : {}),
        })
    if (cached && !relaunch) {
      this.logger.log('Result cache hit — returning existing completed analysis', {
        jobId,
        accountId: cached.id,
        userId,
        companyName: dto.company_name,
      })
      // Ré-ouverture d'un dossier frais : AUCUN run n'est lancé. Le front doit
      // ouvrir le dossier directement, jamais afficher « Lancement de l'analyse ».
      return success({ jobId, accountId: cached.id, launched: false, reason: 'cache_hit' })
    }
    // A completed dossier being relaunched in place — reused below (never duplicated).
    const relaunchTarget = relaunch ? cached : null

    // GA-96 — RELANCER ET RÉ-IDENTIFIER SONT DEUX GESTES DIFFÉRENTS.
    //
    // « Actualiser » promet, mot pour mot, de relancer l'analyse « sur ce
    // dossier ». Un lancement qui demande à la fois de rafraîchir CE dossier et
    // de l'ancrer sur une AUTRE société se contredit : ce n'est pas un
    // rafraîchissement, c'est un autre compte. On refuse, on le DIT, et on
    // nomme les deux identités.
    //
    // Le refus est posé ICI, AVANT `consumeAnalysisSlot`, parce qu'un refus qui
    // débite est une punition : l'utilisateur paierait un crédit pour apprendre
    // qu'on n'a rien fait. `applyResearch` garde le même interdit en aval — mais
    // lui ne peut plus rien rendre, le run ayant déjà tourné.
    //
    // La porte pour CHANGER l'identité d'un dossier existe, et c'est une autre :
    // corriger le SIREN sur la fiche (`PATCH /accounts/:id`), ce qui pose la
    // provenance « saisi à la main » — puis relancer, la relance héritant alors
    // de l'identité corrigée. Un geste délibéré, tracé, et réversible.
    if (relaunchTarget?.siren && dto.siren && !isSameRegistryIdentity(relaunchTarget.siren, dto.siren)) {
      this.logger.warn('Relance refusée — identité demandée différente de celle du dossier (GA-96)', {
        accountId: relaunchTarget.id,
        expected: relaunchTarget.siren,
        resolved: dto.siren,
        userId,
        companyName: dto.company_name,
      })
      return failure({
        code: 'identity_mismatch',
        message: buildIdentityMismatchMessage({ expected: relaunchTarget.siren, resolved: dto.siren }),
      })
    }

    // Plan quota — the ONLY launch cap (the 5-analyses-per-hour guardrail was
    // removed by product decision): atomically claim one analysis slot against
    // ``accounts_limit`` (increments ``accounts_used`` and enforces the cap in
    // one guarded UPDATE). Placed AFTER the idempotency / result-cache checks
    // so a reused in-flight job or a cached dossier never burns a slot.
    // ``force`` (operator launch from the monitoring dashboard, gated by the
    // internal secret) bypasses the plan cap. Refunded below if account
    // pre-creation fails.
    // Id de la ligne de registre du débit de CE lancement (null en `force`, où
    // rien n'est débité).
    let debitLedgerId: string | null = null
    // #2163.76 — ce que le rep a explicitement écarté (#2163.38-43 compris)
    // réduit le prix, un crédit par exclusion (voir `resolveAnalysisCost`) : le
    // MÊME compte que celui affiché sur le bouton « Confirmer et lancer »
    // (`ScopeConfirmPanel.tsx`, `estimateAnalysisCredits`), jamais un second
    // calcul qui pourrait diverger.
    const excludedCount = dto.scope_selection?.excluded_entities?.length ?? 0
    if (!opts.force) {
      // `scopeMode` drives the credit cost via the grid (CREDIT_COSTS). Today
      // every scope costs 1, so this is behaviour-neutral; a heavier perimeter
      // only debits more once its grid value is bumped.
      const slot = await this.credits.consumeAnalysisSlot(userId, {
        reason: dto.company_name,
        scopeMode: dto.scope_mode,
        // #3288 — le palier choisi (absent = Approfondie, Louis 10/10) : la MÊME fonction que
        // l'aperçu `GET /analysis/launch-plan` et que l'écran de confirmation.
        cost: resolveAnalysisCost(dto.scope_mode, excludedCount, undefined, dto.scope_selection?.depth),
      })
      // Rattaché au compte quelques lignes plus bas, dès qu'il est connu : le
      // créneau se réserve AVANT que le compte n'existe, et un débit anonyme ne
      // peut ni être remboursé du bon montant ni empêcher un second
      // remboursement. Voir `attachAnalysisDebit`.
      debitLedgerId = slot.ledgerId ?? null
      if (!slot.ok) {
        // `slot.reason` porte le message de `WorkspaceBudgetService.checkGate`
        // quand la porte de coût par espace a bloqué (#2975) — une raison
        // NOMMÉE, distincte du quota de crédits épuisé.
        if (slot.reason) {
          this.logger.log('Analysis blocked — workspace budget gate', {
            userId,
            companyName: dto.company_name,
            reason: slot.reason,
          })
          return failure({ code: 'budget_exceeded', message: slot.reason })
        }
        this.logger.log('Analysis blocked — plan quota reached', {
          userId,
          companyName: dto.company_name,
          used: slot.used,
          limit: slot.limit,
        })
        return failure({
          code: 'quota_exceeded',
          message: SOFT_BRAKE_MESSAGE,
        })
      }
      // #4119 — le créneau est PRIS : à rendre si la suite lève avant l'enfilage.
      claim.held = true
      claim.cost = resolveAnalysisCost(dto.scope_mode, excludedCount, undefined, dto.scope_selection?.depth)
    }

    // DB column is TEXT — fold structured contexts down to a human-readable
    // form for persistence/UI; the worker still gets the typed shape via
    // the BullMQ payload below.
    const persistedContext =
      typeof dto.user_context === 'string' ? dto.user_context : renderAnalysisContext(dto.user_context) || null

    // Compte canonique EXISTANT à réutiliser EN PLACE (jamais une 2ᵉ ligne) —
    // garantie dure « un seul compte par (workspace, entreprise) » :
    //  1. un dossier `completed` relancé explicitement (`relaunchTarget`), sinon
    //  2. une coquille `error`/`canceled` de l'entreprise dans le workspace
    //     (bug prod « 7× Decathlon » : sans ça, chaque relance après échec
    //     appelait `create()` et empilait un doublon). On RÉUTILISE la ligne :
    //     statut → analyzing, user_context/siren rafraîchis, et le nouveau
    //     AnalysisRun est appendé sur le MÊME accountId (historique append-only,
    //     P0 Théo). La mémoire feedback (#506) suit : la jointure workspace +
    //     LOWER(company_name) retombe sur le même dossier.
    //  3. #4603 — le compte de la MÊME société, QUEL QUE SOIT son statut et son
    //     chemin d'entrée (CRM, import, Découvrir). Deux « Veepee » mesurés en
    //     prod le 26/10/2026 : la fiche venue du CRM n'était candidate ni par son
    //     statut (`analyzing` de colonne) ni par sa clé (aucun SIREN, nom du CRM
    //     ≠ raison sociale). Clé : SIREN d'abord, puis `marketMatchKey`
    //     (`same-company-account.ts`). Un `completed` repris ici est un
    //     RAFRAÎCHISSEMENT (run appendé), jamais un écrasement.
    const reuseTarget =
      relaunchTarget ??
      (await this.accountsService.findReusableFailedByUserAndCompany(userId, dto.company_name, {
        siren: dto.siren,
      })) ??
      (await this.accountsService.findSameCompanyAccount(userId, dto.company_name, { siren: dto.siren }))

    // GA-96 — L'IDENTITÉ DU RUN : celle du dossier qu'on rafraîchit.
    //
    // « Un dossier qui connaît son SIREN se rafraîchit sur ce SIREN, jamais sur
    // son nom. » Le nom sert à TROUVER une société qu'on n'a pas encore ; dans
    // un rafraîchissement, l'identité est déjà acquise et c'est elle qui ancre
    // la collecte.
    //
    // Sans cette ligne, « Actualiser l'analyse » repartait avec `siren:
    // undefined` — une résolution par NOM. Mesuré en production le 30/08/2026 :
    // le dossier ROCHE (`552012031`, laboratoire pharmaceutique) est revenu
    // portant `493229280` — ROCHE BOBOIS, distributeur de meubles — avec les
    // contacts et les angles du laboratoire fusionnés dedans.
    //
    // L'ancrage vit ICI, au serveur, et pas seulement dans l'écran qui a
    // déclenché la relance : ce chemin est aussi celui du MCP, de l'opérateur en
    // `force` et de tout client futur. Un client qui omet l'identité ne doit pas
    // pouvoir faire changer un dossier de société.
    //
    // C'est un REPLI, pas une saisie d'autorité : un `dto.siren` explicite gagne
    // toujours — c'est ainsi qu'un opérateur corrige une identité fausse, et que
    // l'entité choisie dans l'autocomplétion reste celle qu'on analyse.
    const siren = dto.siren ?? reuseTarget?.siren ?? undefined
    if (!dto.siren && reuseTarget?.siren) {
      this.logger.log("Relance ancrée sur l'identité du dossier (GA-96 — jamais une résolution par nom)", {
        accountId: reuseTarget.id,
        siren: reuseTarget.siren,
        userId,
        companyName: dto.company_name,
      })
    }

    // `commercial_status` : la colonne kanban du compte, lue pour conditionner le
    // run sur la relation réelle (annexe méthodo p6). Un compte fraîchement créé
    // vaut `inbox` (jamais trié) — c'est-à-dire « rien de déclaré », le défaut.
    const lauraFraming = lauraFramingOf(dto.suggestion_id, dto.suggestion_criteria)
    let account: Pick<
      AccountEntity,
      'id' | 'workspace_id' | 'company_name' | 'commercial_status' | 'website' | 'relationship_memory' | 'updated_at'
    >
    if (reuseTarget) {
      await this.accountsService.reuseForRelaunch(reuseTarget.id, userId, {
        userContext: persistedContext,
        siren,
        // #4642 — le cadrage de CE clic remplace un ancien cadrage Laura, jamais les critères de Découvrir.
        ...(lauraFraming && canReplaceLauraFraming(reuseTarget.discover_origin_criteria)
          ? { discoverOriginCriteria: lauraFraming }
          : {}),
      })
      account = reuseTarget
      this.logger.log('Reusing existing account for relaunch (canonical — no duplicate row)', {
        accountId: reuseTarget.id,
        previousStatus: reuseTarget.status,
        relaunch,
        userId,
        companyName: dto.company_name,
      })
    } else {
      // create() a NEW row ONLY when strictly no canonical account exists for this
      // company in the workspace (in-flight / completed / errored all short-circuit
      // above) — the hard guarantee that no path duplicates.
      const created = await this.accountsService.create(userId, {
        company_name: dto.company_name,
        user_context: persistedContext ?? undefined,
        // Aucun `reuseTarget` sur cette branche (c'est une entreprise réellement
        // nouvelle), donc `siren` y vaut exactement `dto.siren` — le chemin
        // « première analyse » reste byte-identique.
        siren,
        // Le préfixe du jeton dit d'où vient le clic. Tout ce qui n'est pas une
        // suggestion de Découvrir est une recherche — c'est bien ce qui s'est
        // passé, l'utilisateur a tapé un nom. Rien n'est deviné.
        origin: dto.suggestion_id?.startsWith('discover:') ? 'discover' : 'search',
        // #3914 — la raison CALCULÉE qui a fait remonter ce compte dans
        // Découvrir, posée SEULEMENT avec cette origine : c'est elle que
        // l'écran de compte citera si l'analyse conclut différemment.
        ...(dto.suggestion_id?.startsWith('discover:') && dto.suggestion_reason
          ? { discover_origin_reason: dto.suggestion_reason }
          : {}),
        // #3819 (lot RBB) — et les CRITÈRES posés ET satisfaits (secteur, zone,
        // effectif, signal), même condition : jamais hors origine Découvrir.
        ...(dto.suggestion_id?.startsWith('discover:') && !isDiscoverOriginCriteriaEmpty(dto.suggestion_criteria)
          ? { discover_origin_criteria: dto.suggestion_criteria }
          : {}),
        // #4642 — le cadrage d'une conversation avec Laura se garde AUSSI (l'origine reste « search » : l'utilisateur
        // a bien cherché), pour que le dossier dise sur quoi il a été cadré.
        ...(lauraFraming ? { discover_origin_criteria: lauraFraming } : {}),
      })
      if (isFailure(created)) {
        this.logger.warn('Failed to pre-create account', {
          userId,
          companyName: dto.company_name,
          problem: created.problem,
        })
        // Give back the slot claimed above — the run never actually started.
        // Le coût est REPASSÉ explicitement : aucun compte n'existe encore, donc
        // le registre n'a pas de ligne à consulter, et rendre le défaut ferait
        // rendre 8 crédits là où un périmètre plus léger (ou plus d'exclusions,
        // #2163.76) n'en avait pris que quelques-uns — LE MÊME `excludedCount`
        // que celui qui a servi à débiter ci-dessus.
        if (!opts.force)
          await this.credits.refundAnalysisSlot(userId, {
            reason: `échec création: ${dto.company_name}`,
            cost: resolveAnalysisCost(dto.scope_mode, excludedCount, undefined, dto.scope_selection?.depth),
          })
        claim.held = false
        return failure({ code: 'create_failed', message: created.problem.message })
      }
      account = created.output
      this.logger.log('Account created for analysis', {
        accountId: account.id,
        userId,
        companyName: dto.company_name,
      })
    }
    const accountId = account.id
    claim.accountId = accountId
    // Le débit porte enfin le compte qu'il a payé : c'est ce qui rend un
    // remboursement EXACT (le montant réellement pris, pas un défaut) et
    // IDEMPOTENT (deux chemins ne peuvent plus rendre deux fois le même
    // crédit). Best-effort — un rattachement raté retombe sur l'ancien
    // comportement.
    await this.credits.attachAnalysisDebit(debitLedgerId, accountId)

    // Append-only run history (Théo P0) — record this launch as a distinct
    // AnalysisRun so re-analysing the same account keeps a trace of every run
    // instead of overwriting one row. Best-effort: never blocks the hot path.
    // Cadrage saisi à l'écran de confirmation AVANT le débit (Théo P0-02) : ce
    // que le commercial a priorisé et surtout ce qu'il a EXCLU. Un cadrage vide
    // n'est ni transmis ni stocké — le run reste alors celui d'avant la feature.
    // #4432.2 — la zone d'une recherche Découvrir ou Laura devient le PÉRIMÈTRE du run (« Safran en
    // Occitanie »), quand le cadrage n'en pose pas déjà un : un périmètre saisi gagne toujours, et sans
    // critère de zone rien n'est ajouté (analyse nationale, comme avant).
    const searchedGeo =
      /^(discover|laura):/.test(dto.suggestion_id ?? '') && !dto.scope_selection?.geo_perimeter
        ? geoScopeFromOriginCriteria(dto.suggestion_criteria)
        : undefined
    const requestedScope = searchedGeo ? { ...(dto.scope_selection ?? {}), ...searchedGeo } : dto.scope_selection
    const scopeSelection: AnalysisScopeSelection | undefined = isScopeSelectionEmpty(requestedScope)
      ? undefined
      : requestedScope

    // #4667 — l'historique « Mes analyses » lit `analysis_runs.workspace_id` : un compte sans espace (fiche venue
    // d'un import, relancée depuis Laura) posait un run invisible. Repli sur l'espace actif de l'utilisateur.
    const runWorkspaceId = account.workspace_id ?? (await this.activeWorkspaceIdOf(userId))
    const analysisRunId = await this.runs.recordStart({
      accountId,
      userId,
      workspaceId: runWorkspaceId,
      scopeMode: dto.scope_mode ?? null,
      // L'identité RÉELLEMENT analysée par ce run (GA-96), pas celle que
      // l'appelant a pensé à joindre : l'historique des runs doit pouvoir dire
      // sur quelle société chaque relance a porté.
      siren: siren ?? null,
      scopeSelection: scopeSelection ?? null,
      // #3212.3 (épopée #3235), lot E7 — la révision de fiche que CE run lit,
      // timbrée à l'instant du lancement (même geste que `analysis_version`).
      accountContextVersion: account.updated_at ? account.updated_at.toISOString() : null,
    })

    // Audit: journal the launch in user_actions (drives the Historique page +
    // weekly stats). Best-effort — never blocks the launch. `analysis_completed`
    // is written symmetrically when the plan phase persists (see
    // AnalysisPersistenceService.recordAnalysisCompleted).
    await this.persistence.recordAnalysisStarted(accountId, userId, runWorkspaceId, analysisRunId)

    // Condition the run on the seller's ESN profile. An explicit
    // ``dto.profile_data`` (operator/demo override) wins; otherwise derive it
    // from the user's stored onboarding answers so strategy/plan is tailored
    // instead of profile-neutral.
    //
    // #2451.1 / #2453.7 — le MODE DE CONTEXTE du lancement : celui de l'appel,
    // sinon le défaut de l'espace. Un mode qui exclut le profil (Mission
    // ponctuelle, Neutre) fait partir le run SANS le lire — la couche n'est pas
    // « priée d'être ignorée », elle n'est pas là. Une surcharge explicite
    // (`dto.profile_data`, opérateur/démo) reste une entrée choisie : elle gagne.
    //
    // #2453.6 — les deux conflits se tranchent par LA hiérarchie
    // (`resolveByPrecedence`, `CONTEXT_PRECEDENCE`), jamais par un `??` écrit ici :
    // la demande explicite bat le défaut de l'espace, le mode bat le profil
    // habituel. Le défaut n'est lu que si aucune couche plus haute n'a tranché.
    const contextMode: LauraContextMode =
      resolveByPrecedence<LauraContextMode>({
        explicit_request: dto.context_mode,
        defaults: dto.context_mode ? undefined : opts.workspaceDefaultMode,
      }) ?? DEFAULT_LAURA_CONTEXT_MODE
    const profileSource = resolveByPrecedence<'override' | 'excluded_by_mode' | 'usual_profile'>({
      explicit_request: dto.profile_data !== undefined ? 'override' : undefined,
      mode_context: contextModeExcludes(contextMode, 'profile') ? 'excluded_by_mode' : undefined,
      defaults: 'usual_profile',
    })
    const profileData =
      profileSource === 'override' && dto.profile_data
        ? dto.profile_data
        : profileSource === 'excluded_by_mode'
          ? {}
          : await this.resolveProfileData(userId)

    // Reproducibility (P0-08): pin the exact profile that conditioned THIS run,
    // so a later resume replays these inputs instead of re-deriving the profile
    // as it stands then. Best-effort — never blocks the launch.
    // Les deux annotations du run — les valeurs du profil, puis sa provenance.
    //
    // Le `catch` est ici et pas seulement chez l'appelé. Les deux méthodes
    // rattrapent déjà leurs propres erreurs, mais s'appuyer là-dessus fait
    // dépendre le lancement d'une promesse tenue ailleurs : il suffit qu'une
    // future version lève AVANT son `try` — un argument invalide, une connexion
    // fermée — pour qu'une écriture d'audit fasse tomber une analyse payée.
    // Une métrique ne doit ni retarder, ni empêcher, ni casser ce qu'elle observe.
    if (analysisRunId) {
      await this.runs.recordSellerContext(analysisRunId, profileData).catch(() => undefined)

      // La PROVENANCE de ce profil (§13/§53) : le run garde le droit, ou non, de
      // se dire personnalisé, avec les versions qui l'ont produit. Sans elle, un
      // dossier générique se présentait comme taillé sur mesure et écrivait
      // « profil ESN non précisé » au milieu du score, sans que personne puisse
      // dire quel profil avait été lu ni pourquoi il manquait.
      await this.resolveProfileProvenance(userId, dto.profile_data !== undefined, contextMode)
        .then(provenance => this.runs.recordProfileProvenance(analysisRunId, provenance))
        .catch(() => undefined)
    }

    // Target market → `country` for the IA. A per-analysis override (`dto.country`
    // from the search-bar country selector — recherche multi-pays #494) wins when
    // present: it lets a FR workspace launch e.g. an « Apple Inc » (US) run
    // without changing the team-wide market. `FR` chosen explicitly resolves to
    // no country (the strictly-unchanged French wire). Absent ⇒ fall back to the
    // workspace market so the existing behaviour is byte-identical. FR (either
    // path) sends no `country`, leaving the French pipeline untouched.
    const country = dto.country
      ? dto.country === 'FR'
        ? undefined
        : dto.country
      : await this.resolveRunCountry(account.workspace_id ?? null)

    // Mémoire de corrections (A2) : les retours utilisateur déjà posés sur cette
    // entreprise dans le workspace (dossiers précédents inclus) deviennent des
    // directives pour ce run — que le compte soit fraîchement créé ou réutilisé.
    const accountFeedback = await this.resolveAccountFeedback(account)

    // Mémoire du graphe (Annexe Organigramme §5) : un contact déjà écarté sur
    // cette entreprise ne doit pas réapparaître dans le graphe de ce run.
    const orgGraphMemory = await this.resolveOrgGraphMemory(account)
    // Couche zéro (annexe méthodo p8) : « chercher ce qui existe avant de
    // proposer du froid ». Le relevé du CRM connecté part avec le run, comme le
    // profil — sans CRM connecté il est `undefined` et le pipeline est inchangé.
    // #2453 — « Neutre » écarte aussi le CRM branché : il n'est pas relevé.
    const crmPresence = contextModeExcludes(contextMode, 'crm')
      ? undefined
      : await this.resolveCrmPresence(account, userId)
    // Couche zéro, suite (p8) : les AUTRES outils internes de l'ESN — Drive,
    // notes, e-mails, ATS. Sans intégration connectée c'est `undefined`, zéro
    // appel réseau, et le prompt reste byte-identique.
    // #2453 — les traces des outils internes sont l'historique commercial : « Neutre » les écarte.
    const internalHistory = contextModeExcludes(contextMode, 'commercial_history')
      ? undefined
      : await this.resolveInternalHistory(account, userId)
    // #4070 — les faits du compte (socle #4069), les interlocuteurs connus et l'analyse
    // précédente : le plan, les contacts et le « pourquoi maintenant » les lisent, datés.
    const factsInputs = await this.resolveFactsInputs(account, userId, { contextMode, crmPresence, siren })
    // #3753.3 — le ciblage de l'ESN sur ce compte (tier, raison, problématiques,
    // projets IT) : des hypothèses du vendeur, jamais des faits collectés.
    // #3819 (lot RBB, décision Louis 11/10) — la raison et les critères de
    // Découvrir rejoignent ce ciblage : ceux de CE clic, sinon ceux que le
    // compte réutilisé a gardés. Le run les reçoit comme hypothèses, jamais faits.
    const discoverOrigin = dto.suggestion_id?.startsWith('discover:')
      ? { reason: dto.suggestion_reason, criteria: dto.suggestion_criteria }
      : lauraFraming
        ? { reason: undefined, criteria: lauraFraming }
        : reuseTarget
          ? discoverOriginOfAccount(reuseTarget)
          : undefined
    const sellerHypotheses = withDiscoverOrigin(
      await this.resolveSellerHypotheses(account, contextMode),
      discoverOrigin,
    )
    // Relation réelle (annexe méthodo p6) : la colonne kanban du compte part avec
    // le run. Sans elle, un compte que le commercial suit — ou dont il est déjà
    // le fournisseur — était ré-analysé comme un compte froid à chaque fois.
    const commercialStatus = relationStatusForRun(account.commercial_status)
    // Boucle d'apprentissage (§6) : ce que l'équipe a déjà converti — ou jugé
    // obsolète — conditionne la priorisation du plan. Vide ⇒ clé omise du wire.
    const workspaceLearning = await this.resolveWorkspaceLearning(account.workspace_id)
    // #3278.3 — les presets de canal cèdent devant le MESURÉ : voir `resolveChannelPerformance`.
    const channelPerformance = await this.resolveChannelPerformance(account.workspace_id)
    // Axe CHEMIN (#1631.3/.4, lot 14) — voir `resolveMarketPathAxis`.
    const marketPathAxis = await this.resolveMarketPathAxis(account, accountId)
    // Axe RELATION (#2298.4, lot 19/09) — voir `resolveRelationAxis`.
    const relationAxis = await this.resolveRelationAxis(account, accountId)

    // #3623 — les documents joints à cette analyse passent de `personal` à `account` MAINTENANT : le
    // compte existe, aucune phase n'a encore lu la base. Sans cela le document restait lisible par les
    // autres analyses de son auteur jusqu'à ce que le web le rattache.
    if (dto.attachment_document_ids?.length) {
      await this.attachmentBinder?.bindToAccount(dto.attachment_document_ids, accountId, userId)
    }

    // Enqueue can throw (invalid jobId, Redis down…) AFTER the slot was claimed
    // and the account row created. Refund the slot + mark the account errored so
    // a launch failure never burns a credit (Théo §7 billing: "rembourser si
    // échec non utilisateur") nor leaves a stuck `analyzing` orphan.
    // ⚠️ Le type se lit sur la CLASSE `Queue`, pas sur `typeof this.analysisQueue`.
    // La requête de type `typeof this.…` oblige TypeScript à résoudre `this` au
    // milieu du corps de `start()` — et il y renonce (« Cannot find name 'this' »,
    // TS2304) passé une certaine taille de méthode. Mesuré ici : ajouter le refus
    // d'identité de GA-96 quelques centaines de lignes plus haut a suffi à faire
    // basculer la méthode par-dessus le seuil, et à faire ÉCHOUER une ligne que
    // personne n'avait touchée. `Queue<AnalysisJobData>` désigne exactement le
    // même type — c'est la déclaration du constructeur, ligne 214 — sans
    // dépendre de `this`, donc sans ce seuil.
    let job: Awaited<ReturnType<Queue<AnalysisJobData>['add']>>
    try {
      job = await this.analysisQueue.add(
        'analyze',
        {
          accountId,
          userId,
          companyName: dto.company_name,
          workspaceId: account.workspace_id ?? undefined,
          // L'ancre d'identité de la collecte (GA-96). Sur une relance, c'est
          // celle du dossier — c'est CE passage qui empêche la phase 1 de
          // repartir du seul nom et de ramener une autre société.
          siren,
          scopeMode: dto.scope_mode,
          // Ce que le commercial a exclu doit réellement être exclu du dossier :
          // le worker applique le cadrage aux sorties de phases (entités, angles,
          // contacts) avant de les persister. Absent = aucune coupe.
          scopeSelection,
          // Undefined for the FR default → omitted from the IA request body.
          country,
          profileData,
          ...(contextMode !== DEFAULT_LAURA_CONTEXT_MODE ? { contextMode } : {}),
          userContext: dto.user_context,
          accountFeedback,
          ...orgGraphMemory,
          crmPresence,
          internalHistory,
          ...factsInputs,
          ...(sellerHypotheses ? { sellerHypotheses } : {}),
          commercialStatus,
          workspaceLearning,
          ...(channelPerformance ? { channelPerformance } : {}),
          ...marketPathAxis,
          ...relationAxis,
          website: account.website ?? undefined,
          correlationId: getCorrelationId() ?? randomUUID(),
          // A slot was claimed above unless this is an operator force launch.
          slotConsumed: !opts.force,
        },
        {
          jobId,
          // Bounded auto-retry so a TRANSIENT stream cut self-heals. A mid-run
          // Railway redeploy (or proxy idle-close) severs the IA SSE and surfaces
          // as ``AnalysisStreamInterruptedError`` — a *retryable* error. BullMQ
          // re-runs the SAME job (same ``jobId`` → the credit is NEVER re-charged:
          // ``consumeAnalysisSlot`` ran once above, refund only on terminal
          // failure), and the worker derives ``resume: true`` from the outbox
          // ``analysis.phase_completed`` checkpoints so the retry SKIPS the phases
          // that already landed (no re-paid Claude phase). A GENUINE failure
          // (``run_failed`` / a persistence CHECK violation) is thrown as an
          // ``UnrecoverableError`` → moved straight to failed, never retry-looped.
          // Exponential-jitter backoff (registered in ``ANALYSIS_WORKER_OPTIONS``)
          // spaces the retries so a redeploy has time to finish first.
          attempts: 3,
          backoff: { type: 'exponential-jitter', delay: 5000 },
        },
      )
    } catch (cause) {
      this.logger.error('Failed to enqueue analysis job — refunding slot', { error: cause, accountId, jobId, userId })
      if (!opts.force)
        await this.credits.refundAnalysisSlot(userId, { reason: `échec enqueue: ${dto.company_name}`, accountId })
      claim.held = false
      await this.accountsService.markErrored(accountId, "Impossible de lancer l'analyse. Réessaie.")
      return failure({ code: 'create_failed', message: "Impossible de lancer l'analyse. Réessaie." })
    }

    // Le job est en file : le worker rend le crédit sur un échec terminal (`slotConsumed`).
    claim.held = false

    // Best-effort product event — the run is now queued. `scope_mode` + workspace
    // let the overview compute analyses-per-workspace and scope-mix.
    void this.analytics?.track('analysis_started', {
      userId,
      workspaceId: account.workspace_id ?? null,
      properties: { accountId, scope_mode: dto.scope_mode ?? null, has_siren: Boolean(dto.siren) },
    })

    return success({ jobId: job.id ?? jobId, accountId, launched: true })
  }

  /**
   * Rendre le crédit d'un run mort sans avoir rien produit (règle Théo §7 :
   * « rembourser si échec non utilisateur »).
   *
   * `status='analyzing'` a QUATRE sorties, et trois d'entre elles ne peuvent pas
   * s'appuyer sur le worker — c'est justement le cas où il n'a jamais émis son
   * événement terminal (redeploy / OOM / éviction Redis) :
   *   1. worker `onFailed` — rembourse déjà (`slotConsumed`) ;
   *   2. réparation à la lecture (`getStatus`) ;
   *   3. faucheur périodique (`StuckAnalysisReaper`) ;
   *   4. réparation à la relance (`start`, couche d'idempotence 2 — #627).
   *
   * Les trois dernières passent toutes par `markInterrupted`, une transition
   * gardée sur `status='analyzing'` : **une seule peut la gagner**, donc ce
   * remboursement est appelé au plus une fois par run mort, quel que soit le
   * nombre de chemins qui l'atteignent en parallèle. Depuis #627 les trois sont
   * atteignables sur les MÊMES lignes (un job orphelin ne compte plus comme
   * vivant), ce qui rend la garde indispensable plutôt que théorique.
   *
   * Best-effort : un échec de facturation ne doit jamais empêcher la sortie de
   * l'état `analyzing` — c'est le bug qu'on répare.
   */
  private async refundInterruptedRun(userId: string, accountId: string, reason: string): Promise<void> {
    try {
      await this.credits.refundAnalysisSlot(userId, { reason: `run interrompu (${reason})`, accountId })
    } catch (err) {
      this.logger.warn('Failed to refund analysis slot for a repaired run', {
        accountId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  /**
   * User-initiated resume after a failed analysis. Re-enqueues the same
   * ``accountId``; the worker reads ``analysis.phase_completed`` events
   * from the outbox at start and skips every phase that's already done,
   * picking up exactly where the previous attempt failed.
   *
   * Refuses if the account is in ``completed`` state — there's nothing
   * to resume, and a fresh re-run should go through ``start``.
   */
  async resume(
    accountId: string,
    userId: string,
    scope?: AnalysisAccountScope,
  ): Promise<Result<AnalysisStartResult, AnalysisFailure>> {
    // #4119 — même filet que `start` : une reprise REDÉBITÉE qui lève avant l'enfilage rend son crédit.
    const claim: SlotClaim = { held: false, cost: 0 }
    try {
      return await this.resumeClaiming(accountId, userId, scope, claim)
    } catch (error) {
      if (claim.held) await this.releaseUnlaunchedSlot(claim.owner ?? userId, claim.company ?? accountId, claim)
      throw error
    }
  }

  private async resumeClaiming(
    accountId: string,
    userId: string,
    scope: AnalysisAccountScope | undefined,
    claim: SlotClaim,
  ): Promise<Result<AnalysisStartResult, AnalysisFailure>> {
    // #2704 — même borne que `getStatus` : l'espace, pas l'utilisateur.
    const account = await this.findAccountForCaller(accountId, userId, scope)
    if (!account) {
      return failure({ code: 'not_found', message: `Account ${accountId} not found` })
    }

    if (account.status === 'completed') {
      return failure({ code: 'not_found', message: 'Analyse déjà terminée — rien à reprendre.' })
    }

    // #2704 — le run reprend pour son LANCEUR : même identifiant de tâche, même
    // ligne de registre, mêmes écritures bornées par `user_id`. Reprendre au nom
    // de l'appelant ré-enfilait un job que personne ne dédupliquait et laissait
    // `markAnalyzing` sans effet — la bannière d'erreur ne partait jamais.
    const ownerId = account.user_id
    claim.accountId = accountId
    claim.owner = ownerId
    claim.company = account.company_name
    // #2704.8 — même raison qu'à `getStatus` : le SIREN doit être présent pour
    // retrouver le job d'un run à périmètre verrouillé.
    const jobId = this.buildJobId(ownerId, account.company_name, account.siren ?? undefined)

    // Idempotency: if a job is still in flight (concurrent resume click,
    // stale state…), surface the existing accountId instead of double-queueing.
    const existing = await this.analysisQueue.getJob(jobId)
    if (existing) {
      const state = await existing.getState()
      if ((ACTIVE_JOB_STATES as readonly string[]).includes(state)) {
        return success({ jobId, accountId, launched: true, reason: 'in_flight' })
      }
      await existing.remove()
    }

    // Reprendre est GRATUIT tant que le run reprise est encore payé — c'est le
    // cas d'un échec dont le crédit n'a pas été rendu, et c'est ce qu'attend un
    // utilisateur qui clique « Reprendre » après une panne. Mais un run dont le
    // crédit a été RENDU (annulation, échec remboursé) n'est plus payé : le
    // reprendre gratuitement livrerait un dossier complet pour zéro crédit.
    // L'invariant est simple et se dit en une phrase : **un dossier livré = un
    // débit**. Dans le doute — aucun débit rattaché, run de l'opérateur, ligne
    // de registre manquante — on ne fait PAS payer.
    // #2704 — le registre est celui du LANCEUR : c'est sous son identifiant que
    // le débit du run a été écrit, donc c'est là qu'on va chercher s'il est
    // encore dû. Le seau de crédits, lui, est celui de l'espace dans les deux
    // cas — ce choix n'est pas une facturation de plus, c'est la bonne ligne.
    if (!(await this.credits.hasOutstandingAnalysisDebit(ownerId, accountId))) {
      const slot = await this.credits.consumeAnalysisSlot(ownerId, {
        reason: `reprise: ${account.company_name}`,
        accountId,
      })
      if (!slot.ok) {
        if (slot.reason) {
          this.logger.log('Resume blocked — workspace budget gate', { accountId, userId: ownerId, reason: slot.reason })
          return failure({ code: 'budget_exceeded', message: slot.reason })
        }
        this.logger.log('Resume blocked — plan quota reached', {
          accountId,
          userId: ownerId,
          used: slot.used,
          limit: slot.limit,
        })
        return failure({
          code: 'quota_exceeded',
          message: SOFT_BRAKE_MESSAGE,
        })
      }
      // #4119 — cette reprise a PAYÉ son créneau : à rendre si la suite lève, et à faire rendre par le
      // worker sur un échec terminal (`slotConsumed`). Une reprise gratuite ne porte rien de tout cela.
      claim.held = true
      claim.cost = resolveAnalysisCost()
    }

    // Flip status back to 'analyzing' so the UI moves off the error banner
    // and renders the progress card again. The worker overwrites status on
    // success/failure as usual.
    await this.accountsService.markAnalyzing(accountId, ownerId)

    // Reproducibility (P0-08): replay the EXACT profile the original run was
    // conditioned on (snapshotted at launch), so a profile edited since the run
    // doesn't silently change the resumed phases' inputs. Falls back to the
    // current profile for older runs that carry no snapshot (was the behaviour
    // for every run before the column; still better than the old ``{}``).
    const profileData = (await this.runs.getSellerContext(accountId)) ?? (await this.resolveProfileData(ownerId))

    // Même mémoire de corrections que le run initial (A2) : les phases reprises
    // reçoivent les directives issues des retours utilisateur, comme le profil.
    const accountFeedback = await this.resolveAccountFeedback(account)
    // Idem couche zéro : une reprise doit voir le même historique CRM que le run
    // initial, sinon la phase reprise retomberait sur un compte « froid ».
    const crmPresence = await this.resolveCrmPresence(account, ownerId)
    const internalHistory = await this.resolveInternalHistory(account, ownerId)
    // #4070 — idem : une reprise relit les mêmes faits du compte (un fait de plus entre-temps
    // n'est pas une raison de rejouer la phase reprise sur un autre historique que le run initial).
    const factsInputs = await this.resolveFactsInputs(account, ownerId, {
      contextMode: DEFAULT_LAURA_CONTEXT_MODE,
      crmPresence,
      siren: account.siren,
    })
    // #3753.3 — idem : une reprise rejoue le même ciblage de l'ESN.
    // #3819 (lot RBB) — et la même origine Découvrir, persistée sur le compte.
    const sellerHypotheses = withDiscoverOrigin(
      await this.resolveSellerHypotheses(account),
      discoverOriginOfAccount(account),
    )
    // Idem relation : la reprise doit rejouer la même colonne kanban.
    const commercialStatus = relationStatusForRun(account.commercial_status)
    // Axe CHEMIN (#1631.3/.4, lot 14) — voir `resolveMarketPathAxis`.
    const marketPathAxis = await this.resolveMarketPathAxis(account, accountId)
    // Axe RELATION (#2298.4, lot 19/09) — idem : une reprise doit rejouer les
    // mêmes sources qu'au lancement.
    const relationAxis = await this.resolveRelationAxis(account, accountId)

    const job = await this.analysisQueue.add(
      'analyze',
      {
        accountId,
        userId: ownerId,
        companyName: account.company_name,
        workspaceId: account.workspace_id ?? undefined,
        profileData,
        userContext: account.user_context ?? undefined,
        accountFeedback,
        // Même mémoire du graphe qu'au lancement : une reprise ne doit pas
        // ressusciter un contact écarté entre-temps.
        ...(await this.resolveOrgGraphMemory(account)),
        crmPresence,
        internalHistory,
        ...factsInputs,
        ...(sellerHypotheses ? { sellerHypotheses } : {}),
        commercialStatus,
        ...marketPathAxis,
        ...relationAxis,
        website: account.website ?? undefined,
        correlationId: getCorrelationId() ?? randomUUID(),
        ...(claim.held ? { slotConsumed: true } : {}),
      },
      // Same self-healing budget as ``start``: a manual resume that itself hits a
      // transient stream cut auto-retries (resume-safe — skips landed phases) so
      // the user needn't click "Reprendre" twice for one redeploy. Genuine
      // failures stay terminal (``UnrecoverableError``, no retry-loop).
      { jobId, attempts: 3, backoff: { type: 'exponential-jitter', delay: 5000 } },
    )

    // En file : le worker rend le crédit sur un échec terminal.
    claim.held = false
    this.logger.log('Analysis resumed', { jobId, accountId, userId: ownerId })
    return success({ jobId: job.id ?? jobId, accountId, launched: true })
  }

  /**
   * Cancel an in-flight analysis for an account. Best-effort: aborts the
   * worker via its registered ``AbortController`` (if any) and removes the
   * BullMQ job entry so it can't be retried. Both legs are independent:
   * the abort signal stops the active phase fast, the queue removal frees
   * the jobId for a fresh start.
   *
   * Called from ``AccountsController.delete`` before the row is deleted so
   * the worker doesn't write to a row that's about to disappear.
   */
  async cancel(accountId: string, userId: string, scope?: AnalysisAccountScope): Promise<void> {
    const account = await this.findAccountForCaller(accountId, userId, scope)
    if (!account) {
      // Account already gone or out of the caller's reach — nothing to cancel.
      return
    }
    // #2704 — l'identifiant de tâche se reconstruit sur le LANCEUR : bâti sur
    // l'appelant, il ne désignait aucun job et le worker continuait d'écrire
    // dans une ligne qu'on venait d'effacer.
    // #2704.8 — même raison qu'à `getStatus`/`resume` : sans le SIREN, un run
    // à périmètre verrouillé n'est jamais retrouvé pour être annulé.
    const jobId = this.buildJobId(account.user_id, account.company_name, account.siren ?? undefined)
    await this.cancelJob(jobId, accountId, 'account_deleted')
  }

  /**
   * User-initiated cancellation of an in-flight analysis (kept account).
   * Same machinery as ``cancel()`` (abort signal + secret revocation +
   * queue removal) plus a row update so the UI shows "Analyse annulée"
   * instead of staying stuck on the analyzing banner.
   *
   * Status now uses ``'canceled'`` and keeps ``error_message`` for a
   * stable human-readable cancellation reason.
   */
  async cancelByUser(
    accountId: string,
    userId: string,
    scope?: AnalysisAccountScope,
  ): Promise<Result<{ accountId: string }, AnalysisFailure>> {
    // #2704 — même borne que `getStatus` : l'espace, pas l'utilisateur. Un
    // coéquipier voit la barre de progression, il doit pouvoir l'arrêter.
    const account = await this.findAccountForCaller(accountId, userId, scope)
    if (!account) {
      return failure({ code: 'not_found', message: `Account ${accountId} not found` })
    }
    // Audit H1 — seule une analyse EN COURS s'annule. Sans ce test, annuler un
    // dossier déjà livré rendait son crédit (le registre ne porte aucun
    // remboursement pour un run réussi, donc « reste à rendre = débit entier ») :
    // une analyse gratuite à chaque clic, le dossier restant lisible.
    if (account.status !== 'analyzing') {
      return failure({
        code: 'not_cancellable',
        message: "Cette analyse n'est plus en cours — il n'y a rien à annuler.",
      })
    }
    // #2704 — le run annulé est celui du LANCEUR : son jobId, sa ligne, son
    // crédit rendu. Jamais celui de qui clique.
    const ownerId = account.user_id
    // #2704.8 — même raison : sans le SIREN, l'annulation utilisateur vise un
    // jobId que la file n'a jamais eu pour un run à périmètre verrouillé.
    const jobId = this.buildJobId(ownerId, account.company_name, account.siren ?? undefined)

    await this.cancelJob(jobId, accountId, 'user_cancelled')

    // Flip status so the UI moves on from the analyzing banner. Use the
    // dedicated 'canceled' status and keep a stable cancellation message.
    await this.accountsService.markCancelled(accountId, ownerId)

    // Mirror the terminal state onto the run history (best-effort).
    await this.runs.completeLatest(accountId, { status: 'canceled' })

    // Le crédit revient. Un run annulé ne livre AUCUN dossier : le garder
    // revenait à faire payer une analyse qui n'existe pas — c'est le retour bêta
    // « j'ai eu 8 crédits facturés alors que je n'ai eu aucun résultat », et
    // c'était d'autant plus dur que l'annulation avait été provoquée par une
    // barre de progression fausse. Le remboursement est celui du registre :
    // le montant RÉELLEMENT débité, une seule fois.
    //
    // Ce qui empêche l'analyse gratuite : reprendre un run dont le crédit a été
    // rendu le redébite (voir {@link resume}). Un dossier livré coûte un débit,
    // jamais zéro.
    await this.refundCancelledRun(ownerId, accountId, `annulation: ${account.company_name}`)

    return success({ accountId })
  }

  /**
   * Rend le crédit d'un run arrêté avant d'avoir livré quoi que ce soit.
   *
   * `requireLedgerDebit` : sans ligne de débit rattachée au compte, on ne rend
   * RIEN. Un run lancé par l'opérateur (`force`) n'a jamais rien coûté au
   * client, et lui créditer le tarif par défaut lui offrirait des crédits qu'il
   * n'a pas payés. Les runs lancés avant le rattachement sont dans le même cas :
   * on préfère ne pas rendre que rendre à tort — l'opérateur peut créditer à la
   * main depuis le back-office, l'inverse ne se voit jamais.
   *
   * Best-effort : un échec de facturation ne doit pas faire échouer une
   * annulation qui, elle, a bien eu lieu.
   */
  private async refundCancelledRun(userId: string, accountId: string, reason: string): Promise<void> {
    try {
      await this.credits.refundAnalysisSlot(userId, { reason, accountId, requireLedgerDebit: true })
    } catch (err) {
      this.logger.warn('Failed to refund the analysis slot of a cancelled run', {
        accountId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  /**
   * Operator-initiated stop of ANY user's in-flight analysis, from the
   * super-admin backoffice (behind ``InternalSecretGuard``). Reuses the EXACT
   * same cancellation path as the user-cancel — the shared
   * {@link AnalysisCancellationService} abort signal + BullMQ job removal via
   * {@link cancelJob} — so there is no second cancel mechanism to keep in sync.
   * The only difference is the lookup is cross-tenant (``findByIdUnscoped`` — no
   * ``user_id`` scope) and the jobId is rebuilt WITH the account's stored
   * ``siren`` so it matches the id ``start()`` enqueued for scope-locked runs.
   *
   * Two modes:
   *  - ``stop`` (default): cancel a live run → status ``canceled``;
   *  - ``force_error``: a zombie ``analyzing`` row whose job is already gone →
   *    status ``error`` so it stops shadowing the UI (still fires the abort +
   *    queue-removal best-effort in case a job lingers).
   *
   * Audit-logged (who stopped what, when) via the structured logger — the same
   * audit path the other admin mutations use (Winston tags → Sentry/Grafana).
   */
  async cancelByAdmin(
    accountId: string,
    mode: AdminStopMode = 'stop',
    actor: string = 'backoffice',
  ): Promise<Result<{ accountId: string; status: 'canceled' | 'error'; ownerUserId: string }, AnalysisFailure>> {
    const account = await this.accountsService.findByIdUnscoped(accountId)
    if (!account) {
      return failure({ code: 'not_found', message: `Account ${accountId} not found` })
    }
    const ownerUserId = account.user_id
    // Rebuild the jobId WITH the account's siren so it matches what `start()`
    // enqueued for a scope-locked run (buildJobId suffixes `-siren-<siren>`).
    const jobId = this.buildJobId(ownerUserId, account.company_name, account.siren ?? undefined)

    await this.cancelJob(jobId, accountId, mode === 'force_error' ? 'admin_force_error' : 'admin_stopped')

    if (mode === 'force_error') {
      await this.accountsService.markErrored(accountId, ANALYSIS_ADMIN_FORCE_ERROR_MESSAGE)
      await this.runs.completeLatest(accountId, { status: 'error' })
    } else {
      // Reuse the owner's userId (from the cross-tenant lookup) so the existing
      // user-scoped markCancelled applies — no new unscoped write path.
      await this.accountsService.markCancelled(accountId, ownerUserId)
      await this.runs.completeLatest(accountId, { status: 'canceled' })
    }

    // Même règle que l'annulation utilisateur, et pour la même raison : dans les
    // deux modes le client repart sans dossier. `force_error` vise un run déjà
    // mort — si le worker l'a remboursé, le registre le sait et ce second appel
    // ne fait rien.
    await this.refundCancelledRun(ownerUserId, accountId, `arrêt opérateur: ${account.company_name}`)

    const status: 'canceled' | 'error' = mode === 'force_error' ? 'error' : 'canceled'
    this.logger.log('Admin analysis control', {
      tags: {
        'admin.action': mode === 'force_error' ? 'analysis_force_error' : 'analysis_stop',
        accountId,
        ownerUserId,
        actor,
      },
    })

    return success({ accountId, status, ownerUserId })
  }

  private async cancelJob(jobId: string, accountId: string, reason: string): Promise<void> {
    // 1. Abort the active worker first so it stops issuing IA calls. This
    //    is in-process, instant — the worker's IaClient will see the
    //    AbortSignal fire and bail out of the next HTTP call.
    this.cancellation.cancel(jobId, reason)

    // 2. Revoke the progress callback secret. The IA service runs
    // 3. Remove the queue entry. Throws on locked (active) jobs — that's
    //    expected: the abort signal already handles those, and `onFailed`
    //    will clean up via removeOnFail.
    try {
      const job = await this.analysisQueue.getJob(jobId)
      if (job) {
        await job.remove()
        this.logger.log('Analysis job removed from queue', { jobId, accountId, reason })
      }
    } catch (err) {
      this.logger.warn('Could not remove active job (locked) — relying on abort signal', {
        jobId,
        accountId,
        reason,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  /**
   * #2704 — *ce compte est-il à MOI ?* remplacé par *est-il à NOUS ?*
   *
   * Deux sièges payés dans le même espace : Bedros lance l'analyse d'une
   * société, Adel adopte le compte en vol (`start()` le lui rend déjà
   * correctement), puis recharge son onglet. `GET /analysis/status/:accountId`
   * lisait `WHERE user_id = <appelant>` et rendait 404 — l'écran d'Adel restait
   * sur « Analyse en cours », 0 %, sans message, indéfiniment, et le filet de
   * secours (`useAnalysisStatusSync`) échouait à chaque sondage pour lui.
   *
   * La question posée ici est EXACTEMENT celle de la salle temps réel
   * (`AnalysisGateway.mayWatch`) et celle du dossier (`AccountsController`) : le
   * compte est-il dans l'espace ACTIF de l'appelant, et dans son périmètre
   * d'unité ? Le périmètre arrive résolu du bord — aucun second modèle de
   * droits, aucune seconde définition de « mon portefeuille ».
   *
   * ⚠️ Élargir ne doit RIEN ouvrir : le repli `findOne` est STRICTEMENT plus
   * étroit (le propriétaire lui-même). Il tient les comptes sans
   * `workspace_id` (lignes antérieures au remplissage) et les appelants
   * internes qui n'ont pas de périmètre à passer. Un membre d'un autre espace
   * échoue aux deux lectures et reçoit ce qu'il recevait hier : introuvable.
   */
  /**
   * #2164.17 — la question d'identité d'un run EN PAUSE, ou `null`. Une
   * question n'existe que sur un job différé qui la porte sans réponse : un run
   * qui tourne, déjà répondu ou terminé ne pose rien.
   */
  async entityQuestion(
    accountId: string,
    userId: string,
    scope?: AnalysisAccountScope,
  ): Promise<Result<{ question: AnalysisEntityQuestion | null }, AnalysisFailure>> {
    const account = await this.findAccountForCaller(accountId, userId, scope)
    if (!account) return failure({ code: 'not_found', message: `Account ${accountId} not found` })
    const pending = await this.pendingEntityQuestion(account)
    return success({ question: pending?.question ?? null })
  }

  /**
   * #2164.17 — la réponse : le SIREN choisi est rangé sur le job, qui est PROMU
   * (il reprend tout de suite au lieu d'attendre l'échéance). Le worker en
   * déduit la suite (`resumePlanAfterEntityPause`). Rien n'est débité : c'est
   * le même job, pas une nouvelle analyse.
   */
  async answerEntityQuestion(
    accountId: string,
    userId: string,
    answer: AnalysisEntityAnswer,
    scope?: AnalysisAccountScope,
  ): Promise<Result<{ accountId: string; siren: string }, AnalysisFailure>> {
    const account = await this.findAccountForCaller(accountId, userId, scope)
    if (!account) return failure({ code: 'not_found', message: `Account ${accountId} not found` })
    const pending = await this.pendingEntityQuestion(account)
    if (!pending) {
      return failure({
        code: 'no_entity_question',
        message: "Cette analyse n'attend plus de réponse : elle a déjà repris.",
      })
    }
    if (!pending.question.candidates.some(candidate => candidate.siren === answer.siren)) {
      return failure({
        code: 'invalid_entity_answer',
        message: 'Cette entité ne fait pas partie des sociétés proposées.',
      })
    }
    await pending.job.updateData({
      ...pending.job.data,
      entityAnswer: { siren: answer.siren, answeredAt: new Date().toISOString() },
    })
    await pending.job.promote()
    return success({ accountId: account.id, siren: answer.siren })
  }

  private async pendingEntityQuestion(
    account: AccountEntity,
  ): Promise<{ job: Job<AnalysisJobData>; question: AnalysisEntityQuestion } | null> {
    if (account.status !== 'analyzing') return null
    // Même identifiant de tâche que le statut et l'annulation : le run du LANCEUR.
    const jobId = this.buildJobId(account.user_id, account.company_name, account.siren ?? undefined)
    const job = await this.analysisQueue.getJob(jobId)
    if (!job || job.data.entityAnswer) return null
    const question = analysisEntityQuestionSchema.safeParse(job.data.entityQuestion)
    if (!question.success) return null
    if ((await job.getState()) !== 'delayed') return null
    return { job, question: question.data }
  }

  private async findAccountForCaller(
    accountId: string,
    userId: string,
    scope?: AnalysisAccountScope,
  ): Promise<AccountEntity | null> {
    if (scope) {
      const scoped = await this.accountsService.findOneForWorkspace(
        accountId,
        scope.workspaceId,
        scope.businessUnitScope,
      )
      if (!isFailure(scoped)) return scoped.output
    }
    const owned = await this.accountsService.findOne(accountId, userId)
    return isFailure(owned) ? null : owned.output
  }

  private buildJobId(userId: string, companyName: string, siren?: string): string {
    const slug = companyName
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      // #2704.7 \u2014 un `+` ici FUSIONNAIT toute suite de s\u00e9parateurs sur un SEUL
      // tiret : \u00ab AB & C \u00bb et \u00ab AB&C \u00bb rendaient tous deux \u00ab ab-c \u00bb, donc le
      // M\u00caME jobId pour deux soci\u00e9t\u00e9s distinctes (collision, pas un cas de
      // cloisonnement \u2014 chacune reste propri\u00e9taire de son compte). Un
      // caract\u00e8re non-alphanum\u00e9rique = un tiret, sans fusion ; seuls les bords
      // sont coup\u00e9s ensuite, donc \u00ab sncf reseau \u00bb (un seul s\u00e9parateur) rend
      // toujours \u00ab sncf-reseau \u00bb, inchang\u00e9.
      .replace(/[^a-z0-9]/g, '-')
      .replace(/^-+|-+$/g, '')
    const key = slug || createHash('sha1').update(companyName).digest('hex').slice(0, 12)
    // Scope lock (Th\u00e9o p.10) : deux entit\u00e9s DISTINCTES tap\u00e9es sous le m\u00eame nom
    // (\u00ab Soci\u00e9t\u00e9 G\u00e9n\u00e9rale \u00bb \u2192 banque vs SCI) ne doivent pas collisionner sur le
    // m\u00eame jobId \u2014 on suffixe le SIREN choisi quand il est pr\u00e9sent.
    // BullMQ REJETTE les custom job IDs contenant ':' (d\u00e9limiteur de cl\u00e9s Redis :
    // \u00ab Custom Ids cannot contain : \u00bb), donc on s\u00e9pare avec '-' (userId=UUID et
    // key=slug en contiennent d\u00e9j\u00e0, sans ambigu\u00eft\u00e9 pour l'unicit\u00e9).
    const scoped = siren ? `${key}-siren-${siren}` : key
    return `analysis-${userId}-${scoped}`
  }
}

/**
 * True when an account is still ``analyzing`` yet has not been written to since
 * before the worker's hard job ceiling — i.e. the run outlived any legitimate
 * duration. Combined with a ``not_found`` job state (no live BullMQ job) at the
 * call site, this is the signature of a worker that died mid-run without firing
 * its terminal event. ``updated_at`` is bumped on every write by the DB trigger,
 * so a genuinely live run keeps it fresh and never trips this. Missing/invalid
 * ``updated_at`` ⇒ not stale (never repair on absent evidence).
 */
/**
 * True when a job claims to be in flight but can no longer deliver a terminal
 * event: a worker picked it up (``processedOn`` set) more than one job ceiling
 * ago. The worker bounds itself with ``AbortSignal.timeout(JOB_TIMEOUT_MS)``, so
 * past that point it has either already reported, or the process owing us the
 * report is gone (redeploy / OOM / kill) — and a job whose worker died stays
 * `active` in Redis forever, because nothing is left to run BullMQ's
 * stalled-check.
 *
 * A job that has never started (queued, delayed) has no ``processedOn`` and is
 * never orphaned — it is simply waiting its turn.
 */
function isOrphanedJob(job: { processedOn?: number | null }, now: number = Date.now()): boolean {
  const startedAt = job.processedOn
  if (typeof startedAt !== 'number' || !Number.isFinite(startedAt)) return false
  return now - startedAt > JOB_TIMEOUT_MS
}

function isStaleAnalyzing(account: AccountEntity, now: number = Date.now()): boolean {
  if (account.status !== 'analyzing') return false
  const updatedAt = account.updated_at ? new Date(account.updated_at).getTime() : NaN
  if (!Number.isFinite(updatedAt)) return false
  return now - updatedAt > JOB_TIMEOUT_MS
}

/**
 * Best-effort progress estimate from persisted DB state. Only consulted when the
 * run has no phase checkpoint yet — checkpoints are exact and job-scoped, this
 * is inference from the dossier's contents.
 *
 * Returns `null` when the dossier proves nothing. It previously returned a
 * `{ percent: 10, phase: 'collecting' }` floor, which was the one branch that
 * invented its answer: 10% was not derived from anything, it was a number
 * chosen so the bar wouldn't look empty. "Nous ne savons pas encore" is the
 * truthful answer and the UI is built to render it (`percent: null`).
 */
/**
 * Turn the set of checkpointed phases into the position the client should show.
 *
 * The phase label mirrors what the live stream emits (``research_complete``…)
 * so the seeded value and the streamed value are the same vocabulary — the web
 * maps both through one table. Returns `null` when nothing has completed: that
 * is "we cannot say yet", not "0%".
 */
function progressFromPhases(completedPhases: readonly string[]): { percent: number; phase: string } | null {
  // Trust the canonical order, not the row order — the outbox query is a
  // DISTINCT with no ORDER BY, and phases can land out of order on a resume.
  const last = PROGRESS_PHASES.filter(p => completedPhases.includes(p)).pop()
  if (!last) return null
  return { percent: PHASE_PROGRESS[last], phase: `${last}_complete` }
}

function estimateProgress(
  account: AccountEntity,
  contactsCount: number,
  runStartedAt: Date | null,
): { percent: number; phase: string } | null {
  /**
   * Le dossier persisté ne dit quelque chose du run EN COURS que s'il a été
   * écrit APRÈS son démarrage.
   *
   * Sans cette borne, une RELANCE lisait le dossier du run précédent : des
   * contacts, un `raw_analysis` rempli — donc « 85 %, classify_complete » dès
   * la première seconde d'un run qui vient de partir. Mesuré sur AIRBUS le
   * 19/08 : la barre affichait 85 % pendant les douze premières minutes, puis
   * ne bougeait plus. Ce que l'utilisateur en conclut n'est pas « l'estimation
   * est optimiste », c'est « l'analyse ne marche pas ».
   *
   * Un run sans trace de démarrage (comptes antérieurs à l'historique des runs)
   * garde l'ancien comportement : on ne sait pas le dater, donc on ne l'écarte
   * pas.
   */
  if (runStartedAt) {
    const updatedAt = account.updated_at ? new Date(account.updated_at).getTime() : NaN
    if (!Number.isFinite(updatedAt) || updatedAt < runStartedAt.getTime()) return null
  }
  if (contactsCount > 0) {
    const classified = account.raw_analysis && Object.keys(account.raw_analysis).length > 0
    return classified ? { percent: 85, phase: 'classify_complete' } : { percent: 70, phase: 'contacts_complete' }
  }
  if (account.sector || (account.raw_analysis && Object.keys(account.raw_analysis).length > 0)) {
    return { percent: 40, phase: 'research_complete' }
  }
  return null
}
