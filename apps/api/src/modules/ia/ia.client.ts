import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import type { AccumulatedRouteCriteria, RouteSignals } from '../account-access/route-signals'
import { ConfigService } from '@nestjs/config'
import { HttpClient, type HttpClientRequestOptions } from '@bellum/http'
import {
  computeAnswerCompleteness,
  ESN_ANSWER_OPTIONS,
  mailReplyDraftResultSchema,
  onboardingReformulateResponseSchema,
  parseGraphEvent,
  personNameMatchSchema,
  personNameSourceFamilySchema,
  personNameSourceQueriedSchema,
  ragIngestionRefusal,
  GENERIC_JUDGE_VERDICTS,
  groupPerimeterSchema,
  type ChannelPerformance,
  type GroupPerimeter,
  type GenericJudgeVerdict,
} from '@bellum/contracts'
import type {
  RagDocumentScope,
  MarketLocale,
  CompanySearchResponse,
  TerritoryOverview,
  AnalysisBusinessUnit,
  BusinessUnitContextItem,
  AnalysisContactSeed,
  ContactsInput,
  ContactsResponse,
  ClassifyBatchInput,
  ClassifyBatchResponse,
  ConversationThreadState,
  DiscoverContactsInput,
  DiscoverRegistryFilters,
  DiscoverCommonBaseCandidate,
  DiscoverResponse,
  DiscoverSignalsRequest,
  EnrichContactInput,
  EnrichContactResponse,
  EsnAnswers,
  SearchPeopleByNameInput,
  SearchPeopleByNameResult,
  EsnPrefillResponse,
  ChatResearchMode,
  FollowUpRef,
  ReplyTransformRequest,
  LauraContextMode,
  GraphEvent,
  MeetingNotesInputKind,
  MessageGrounding,
  MailReplyDraftResult,
  OnboardingReformulateResponse,
  PinnedMemoryContextItem,
  PlanInput,
  PlanResponse,
  ProfilerEnvelope,
  ResearchInput,
  ResearchResponse,
} from '@bellum/contracts'
import { CorrelationIdService } from '../../correlation-id/correlation-id.service'
import { CORRELATION_ID_HEADER } from '../../correlation-id/correlation-id.store'

/** Fields a caller can tweak per invocation (deadline / retry budget / caller signal). */
type IaCallOpts = Pick<HttpClientRequestOptions, 'signal' | 'timeoutMs' | 'maxAttempts'>

/**
 * Le budget que NestJS accorde à UN tour de copilote, en millisecondes.
 *
 * C'est la valeur sur laquelle l'orchestrateur du service IA s'est calibré :
 * il borne son tour à 90 s et documente qu'il se cale « sous le budget de
 * l'appelant ». Baisser ce nombre sous le plafond dur de l'orchestrateur
 * (90 s + 10 s de plancher du dernier appel) ramènerait la panne du 15-16/08 :
 * un budget intérieur plus large que le budget extérieur ne produit pas une
 * réponse tardive, il produit un 500.
 *
 * La route web du copilote posait déjà ce budget chez elle
 * (`CHAT_CALL_OPTS`, ia-proxy.controller.ts). Le porter ici en DÉFAUT de la
 * méthode ferme le trou de l'autre appelant : la route MCP
 * `POST /mcp/accounts/:id/ask` — le même copilote, les mêmes outils, depuis
 * l'assistant du commercial — n'en passait aucun et héritait donc des défauts
 * du client HTTP, 30 s et trois tentatives.
 *
 * #3706.1 — recette prod 08/10 : à 120 000 (plafond IA 105 s, marge de 15 s),
 * le PREMIER envoi de chaque recherche de comptes neuve (aucun cache chaud,
 * donc des appels réseau réels vers les sources d'enrichissement) finissait
 * en « erreur côté assistant » après ~2 min, systématiquement — le renvoi
 * (caches désormais chauds) réussissait aussitôt. 15 s ne couvrait pas, en
 * production, à la fois le réseau Node↔IA ET le déroulement de l'annulation
 * de tous les appels d'outils en vol avant que le service IA n'ait pu
 * transmettre sa réponse partielle honnête (`_TIMEOUT_PARTIAL_TAIL`) — Node
 * coupait le flux et la remplaçait par la phrase générique de panne. Portée
 * à 150 000 (marge de 45 s) : la garde `chat-turn-budget.spec.ts` exige
 * maintenant un minimum de 30 s pour que cette marge ne puisse plus
 * retomber en silence.
 */
const CHAT_CALLER_BUDGET_MS = 150_000

/**
 * Le délai amont de `cvExtract`, en millisecondes — voir #2542.M3 juste au
 * niveau de la méthode pour le détail. Résumé : le service IA peut
 * déclencher une lecture optique (OCR) dont le budget PROPRE est
 * `_TIMEOUT_S = 60.0` (`apps/ia/app/services/ocr.py:42`) ; 60 000 + 30 000
 * de marge réseau/sérialisation, même proportion que `CHAT_CALLER_BUDGET_MS`
 * ci-dessus pour son propre budget aval.
 *
 * Les deux dépôts ne partagent pas de constantes : cette valeur RECOPIE
 * consciemment celle de `ocr.py`, elle ne s'y adosse pas par le code.
 */
const CV_OCR_TIMEOUT_MS = 90_000

/** LOT (15/10) DATA-C — en-tête de la voie « lot » lu par `app/middleware/llm_lane.py`. */
const LLM_LANE_HEADER = 'x-bellum-llm-lane'

/** Options de lecture du registre de coûts. Séparées d'`IaCallOpts` : seuls les
 *  appels qui MESURENT les passent, les autres gardent leur signature. */
type IaCostOpts = Pick<HttpClientRequestOptions, 'onResponseHeader' | 'responseHeaderName'>

/** En-tête par lequel le service IA renvoie ce que l'appel a coûté, fournisseur
 *  par fournisseur (D19). Hors des corps de réponse, qui sont des contrats. */
export const IA_COST_HEADER = 'x-bellum-costs'

/** Forme BRUTE (snake_case) de `GET /metrics/cost` — voir `costMetrics()`. Les
 *  champs restent `unknown` : un moteur plus ancien ou un déploiement partiel
 *  ne doit jamais faire planter la lecture, seulement dégrader une valeur. */
type RawIaCostMetrics = {
  prompts?: unknown[]
  total_cost_usd?: unknown
  truncations?: Record<string, unknown>
}

/** `Number.isFinite` avant tout : une chaîne, `NaN` ou `null` ne doivent
 *  jamais propager une valeur non numérique jusqu'à l'écran — ils retombent
 *  sur 0, un compte VRAI pour un prompt qui n'a simplement rien coûté. */
function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function stringOrEmpty(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * `GET /metrics/cost` côté moteur IA, mis en forme (camelCase). Seule cette
 * forme englobante est exportée — les lignes qui la composent ne sont
 * consommées qu'ici (knip : un type exporté et lu dans son seul fichier ne
 * s'exporte pas).
 *
 * ⚠️ Compteurs EN MÉMOIRE DU PROCESS FastAPI : ils repartent de zéro à chaque
 * redéploiement et ne sont PAS agrégés entre replicas — voulu et documenté
 * sur la route elle-même (`apps/ia/app/main.py`). Un ordre de grandeur
 * lisible en direct, jamais une comptabilité.
 */
export type IaCostMetrics = {
  prompts: Array<{
    prompt: string
    calls: number
    inputTokens: number
    outputTokens: number
    cacheReadTokens: number
    cacheCreationTokens: number
    costUsd: number
    model: string
    unpricedCalls: number
  }>
  totalCostUsd: number
  truncations: Record<string, { events: number; wastedOutputTokens: number; wastedCostUsd: number }>
}

/**
 * Combien de base64 on décode pour REGARDER un fichier déposé.
 *
 * 64 000 caractères ≈ 48 Ko de texte : un en-tête de tableau et ses premières
 * lignes tiennent toujours dedans, et un dépôt de 12 Mo ne coûte pas 12 Mo de
 * décodage pour une question à laquelle la première ligne répond. Multiple de 4
 * pour tomber sur une frontière de bloc base64.
 */
const INGESTION_SAMPLE_B64_CHARS = 64_000

/** Le début d'un fichier base64, lu comme du texte. Un binaire donne du bruit —
 *  ce qui est le bon résultat : il ne ressemblera à aucun tableau de contacts. */
function textHeadFromBase64(fileB64?: string): string {
  if (!fileB64) return ''
  return Buffer.from(fileB64.slice(0, INGESTION_SAMPLE_B64_CHARS), 'base64').toString('utf8')
}

/**
 * Max silence on the analysis SSE stream before we declare the IA gone.
 *
 * The IA emits a keepalive comment every 15s (`SSE_KEEPALIVE_SECONDS`,
 * graph_analyze.py) precisely so a long phase never looks like a dead
 * connection. Six missed keepalives is therefore not a slow phase — it is a
 * process that died or a socket that dropped without closing. Without this bound
 * the read simply never returned, and the account sat in `analyzing` for the
 * full 20-minute job ceiling with no error and no progress: the user could not
 * tell a dead run from a slow one, and neither could we.
 *
 * Generous relative to the keepalive (6×) so ordinary jitter, a GC pause or a
 * slow proxy can never cost a legitimate analysis.
 */
const GRAPH_STREAM_IDLE_TIMEOUT_MS = 90_000

/**
 * Même garantie que `GRAPH_STREAM_IDLE_TIMEOUT_MS`, pour le flux de chat
 * (LOT STREAM, 12/09/2026) : `chat.py` émet un commentaire de garde toutes
 * les `_KEEPALIVE_SECONDS` (15 s). 4× cette cadence — plus généreux que les
 * 6× du graphe parce qu'un tour de chat reste sous 105 s au total
 * (`CHAT_TURN_CEILING_S`) là où une analyse peut courir 20 minutes ; un
 * multiplicateur aussi large ici retarderait inutilement la détection d'un
 * flux mort sur le tour le plus court et le plus fréquent du produit.
 */
const CHAT_STREAM_IDLE_TIMEOUT_MS = 60_000

/** Inputs for one graph analysis run (or resume). */
type GraphAnalyzeInput = {
  companyName: string
  /** Scope lock (Théo p.10) : SIREN de l'entité choisie — ancre la recherche. */
  siren?: string
  /** Périmètre d'analyse (Théo p.10/21) : biaise la recherche. */
  scopeMode?: string
  /**
   * Le cadrage STRUCTURÉ saisi avant le lancement (recette finale §18) :
   * périmètre juridique, zone, familles métier, niveaux visés, mode.
   *
   * Il était déjà stocké sur le run mais ne partait pas au service IA — donc
   * le commercial cochait « France » et « décideurs BU » sans que rien ne
   * change au résultat. Vide/absent ⇒ la clé n'est PAS envoyée, le run est
   * byte-identique à avant.
   */
  scopeSelection?: Record<string, unknown>
  /**
   * Marché cible (pays) du workspace, ex. "CH". Propagé comme `country` — le param
   * que les country packs de l'IA attendent. Absent = marché FR (défaut) : la clé
   * n'est PAS envoyée, l'IA retombe sur "FR" et aucun pack ne s'active.
   */
  country?: string
  /**
   * Le site du compte, quand il est DÉJÀ connu. Il ne sert qu'à dériver le slug
   * d'un board d'offres (Greenhouse, Lever) sans le deviner depuis le nom :
   * attribuer à un compte les offres du board d'un homonyme écrirait un signal
   * de recrutement faux. Absent ⇒ clé omise, requête byte-identique.
   */
  website?: string
  profileData: Record<string, unknown>
  userContext?: unknown
  /**
   * Mémoire de corrections du compte (feedback loop A2) : directives factuelles
   * condensées côté API depuis les retours utilisateur. Vide/absent = la clé
   * n'est PAS envoyée → requête (et prompts IA) byte-identiques à avant.
   */
  accountFeedback?: string
  /**
   * Mémoire du graphe d'organigramme (Annexe Organigramme §5). `orgGraphVersion`
   * = version courante à reprendre (bumpée par chaque correction utilisateur) ;
   * `orgRejectedItems` = les éléments déjà écartés, que l'assembleur ne doit
   * JAMAIS réinjecter. Absents/à leur valeur neutre = clés non envoyées → wire
   * (et assemblage IA) byte-identiques à avant la feature.
   */
  orgGraphVersion?: number
  orgRejectedItems?: Array<{ sourceId: string; reason: string }>
  /**
   * Couche zéro de la méthodologie de vente (annexe p8) : le relevé RÉEL de ce
   * compte dans le CRM connecté de l'ESN. Renseigné uniquement sur un match, donc
   * sa présence signifie « ce compte est déjà connu » — la recherche en dérive
   * l'état de relation et le plan cesse de recommander une approche froide.
   * Vide/absent (aucun CRM connecté) = la clé n'est PAS envoyée → run identique.
   */
  crmPresence?: string
  /**
   * Traces internes HORS CRM (annexe méthodo p8) : documents Drive, notes,
   * e-mails, ATS. Même contrat que {@link crmPresence} — présente, la clé dit
   * que quelqu'un de l'ESN a déjà touché ce compte ; vide/absente (aucune
   * intégration connectée, le cas par défaut) la clé n'est PAS envoyée et le run
   * est identique.
   */
  internalHistory?: string
  /**
   * #4070.1/.2 — les FAITS DU COMPTE (socle #4069) : signaux de tout âge, besoins,
   * affaires gagnées/perdues/en sommeil, missions, corrections de l'équipe, chacun
   * daté, SANS provenance ni poids, les plus pertinents d'abord. Absent/vide = la
   * clé n'est PAS envoyée → run identique.
   */
  accountFacts?: ReadonlyArray<{ kind: string; label: string; date: string; ageDays: number }>
  /** #4070.3 — interlocuteurs déjà connus de l'espace (CRM, missions passées). */
  knownContacts?: ReadonlyArray<{
    name: string
    role: string | null
    relation: 'crm' | 'mission'
    lastSeen: string | null
  }>
  /** #4070.4 — l'analyse précédente en trace datée (corrections humaines nommées). */
  previousAnalysis?: string
  /** #4070.2 — motifs de perte déclarés par l'équipe, condensés. */
  lostDealRex?: string
  /**
   * #3753.3 — le ciblage que l'ESN a fait de CE compte (tier A/B/C, raison,
   * problématiques, projets IT). Hypothèses du VENDEUR : fournies, NON
   * vérifiées — la phase 1 les injecte sous cette étiquette, jamais comme des
   * faits collectés. Absent (compte hors liste) = clé non envoyée → wire
   * byte-identique.
   */
  sellerHypotheses?: {
    tier_label: string | null
    selection_reason: string | null
    addressable_issues: string | null
    upcoming_it_projects: string | null
    /** #3819 (lot RBB) — raison et critères de sélection Découvrir (hypothèses, non vérifiées). */
    discover_origin_reason?: string | null
    discover_origin_criteria?: string[]
  }
  /**
   * Boucle d'apprentissage (restitution V2 §6) : ce que l'ÉQUIPE a fait des
   * besoins passés, agrégé côté API depuis l'Opportunity Graph. Prior sur l'ESN,
   * jamais un fait sur la cible. Vide/absent (aucun besoin jamais déplacé, le cas
   * par défaut) = la clé n'est PAS envoyée → run identique.
   */
  workspaceLearning?: string
  /** #3278.3 — canaux mesurés de l'espace (réponse sous 14 j). Absent = clé non envoyée. */
  channelPerformance?: ChannelPerformance[]
  /**
   * #2451.1 / #2453.7 — le mode de contexte du dossier (« one_off_mission »,
   * « neutral »). L'API a DÉJÀ retiré les couches exclues ; le prompt du plan
   * dit pourquoi elles manquent. Absent (« Mon activité ») = clé non envoyée.
   */
  contextMode?: LauraContextMode
  /**
   * Le FOCUS du plan d'action, réglé par l'ESPACE (« jamais un prisme IT par
   * défaut ») : combien d'éléments de chaque axe entrent dans la charge utile du
   * plan — et ce qui n'entre pas dans le plafond n'entre pas dans le plan.
   *
   * Vide/absent (le cas par défaut : personne n'a rien réglé) = la clé n'est PAS
   * envoyée, et le service IA applique les valeurs EN VIGUEUR du contrat → run
   * byte-identique à avant la feature.
   */
  focusWeights?: Record<string, number>
  /**
   * Colonne du kanban commercial du compte (annexe méthodo p6) : `watching`,
   * `opportunity`, `customer`, `archived`. C'est ce que le commercial a
   * RÉELLEMENT fait du compte — l'IA en dérive l'état de relation du
   * SalesContext (mouvement d'ouverture, sélection d'actions, garde-fou board).
   * Absent (compte jamais trié, colonne `inbox`) = la clé n'est PAS envoyée →
   * relation « froide » par défaut, run identique.
   */
  commercialStatus?: string
  /**
   * Axe CHEMIN de l'adressabilité (#1631.3/.4, #1606.2, lot 14) : le compte de
   * parcours AGRÉGÉ que la mémoire marché a observés vers ce compte, résolu
   * côté API par `MarketMemoryService` (`pathAxisFor` — la SEULE porte vers
   * ses tables partagées, GA-258). `marketTopEsn` nomme la preuve (« … relient
   * ALTEN … ») ; absent, l'axe reste vrai en désignant « des sociétés de
   * services partenaires ». Les deux absents (aucune couverture, ou sous le
   * seuil transverse `MARKET_MEMORY_MIN_PATHS`) ⇒ clés omises → l'axe reste
   * NON MESURÉ côté IA, exactement comme avant ce lot.
   */
  marketPathsObserved?: number
  marketTopEsn?: string
  /**
   * Axe RELATION de l'adressabilité (#2298.4, lot 19/09) : les QUATRE sources
   * ajoutées en plus du CRM (`crmPresence` plus haut) — missions signées,
   * dernier rendez-vous (agenda), derniers échanges e-mail (MÉTADONNÉES —
   * une date, jamais le corps) et une correction humaine posée sur la
   * relation. Résolues côté API par `AnalysisService.resolveRelationAxis`.
   * Absentes (aucune source réelle) ⇒ clés omises → l'axe reste NON MESURÉ
   * côté IA quand le CRM non plus n'a rien trouvé, exactement comme avant ce
   * lot.
   */
  relationMissionsCount?: number
  relationLastMeetingAt?: string
  relationLastEmailAt?: string
  relationHumanCorrection?: string
  /** #2273.9-.21 — partenaires déclarés en place sur le compte (route « partenaire »). Omis quand il n'y en a aucun. */
  declaredPartners?: string[]
  /** #3278.1 — missions du compte : en cours / terminées (routes « consultant »). */
  consultantHistory?: 'present' | 'former'
  /** #3278.1 — un signal d'achat DÉCLARÉ existe sur ce compte (route « signal entrant »). */
  declaredSignalPresent?: boolean
  /** #2371.4 — placements en cours sur la relation partenaire de même SIREN (10e stade « partenaire actif »). */
  partnerPlacementsActive?: number
  /** #3278.1 — veille / talent / événement / inbound (plan asynchrone). */
  routeSignals?: RouteSignals
  /** #3278.a — preuves / historique des canaux : `{}` = lu, rien trouvé (le plan le dit) ; absent = non lu. */
  accumulatedRouteCriteria?: AccumulatedRouteCriteria
  accountId: string
  userId: string
  /**
   * Portée équipe du grounding RAG. La base de connaissance d'une ESN (références,
   * cas clients, offres) est un actif d'entreprise : l'analyse lancée par un
   * commercial doit s'ancrer sur ce que TOUTE l'équipe a chargé. Absent = portée
   * per-user historique (jamais un élargissement).
   */
  workspaceId?: string
  /**
   * Identifiant du run (le job BullMQ). Il borne le thread du checkpointer côté
   * IA : les tentatives d'un même run se reprennent, deux analyses distinctes du
   * même compte ne partagent aucun checkpoint. Sans lui, le graphe retrouvait un
   * thread où les quatre phases étaient déjà faites et ne recalculait plus rien.
   */
  runId?: string
  /** Resume a previously-failed run on the same run (thread). */
  resume?: boolean
}

/**
 * Single entry point for every HTTP call to the FastAPI IA service.
 *
 * Each method declares one endpoint: its URL template, the camelCase → snake_case mapping,
 * and the response shape. The wire format follows HTTP semantics: `body` for POST payloads
 * that carry complex data (nested objects / arrays), `query` for endpoints whose parameters
 * are scalar filters. Callers only pass typed inputs. Timeout / retry / correlation-id /
 * logging are inherited from `HttpClient` and overridable per call via `IaCallOpts`.
 */

/** LUD.6 bis — la zone des critères Découvrir (« zone : Lyon »), en clé de wire ; `{}` sans zone. */
function openingZoneOf(hypotheses: { discover_origin_criteria?: string[] } | undefined): {
  preferred_zone?: string[]
} {
  const zone = hypotheses?.discover_origin_criteria
    ?.find(line => line.startsWith('zone : '))
    ?.slice('zone : '.length)
    .trim()
  return zone ? { preferred_zone: [zone] } : {}
}

/** Relecture du poste par People-Match (voir {@link IaClient.employmentFreshness}). */
type EmploymentFreshnessReading = {
  status: 'ok' | 'no_identifier' | 'unmatched' | 'unavailable'
  state: 'in_post' | 'left' | 'unknown'
  organization: string | null
  leftOn: string | null
  credits: number
}

@Injectable()
export class IaClient extends HttpClient {
  constructor(config: ConfigService, correlationIdService: CorrelationIdService) {
    const logger = new Logger('IaClient')
    // Shared secret so the IA service can reject un-authenticated callers.
    // When unset (local dev, or before the env is rolled out on both services)
    // no header is sent and the IA middleware runs in no-op mode.
    const internalSecret = config.get<string>('internalApiSecret')
    super({
      baseUrl: config.get<string>('iaServiceUrl', 'http://localhost:8000'),
      logger: {
        log: (message, meta) => logger.log(message, meta),
        warn: (message, meta) => logger.warn(message, meta),
      },
      getCorrelationId: () => correlationIdService.getCorrelationId(),
      correlationIdHeader: CORRELATION_ID_HEADER,
      defaultHeaders: internalSecret ? { 'x-internal-secret': internalSecret } : {},
    })
  }

  /** Phase 1 — research the company: sector, size, recent news, signals. */
  research(input: ResearchInput, opts?: IaCallOpts & { llmLane?: 'batch' }): Promise<ResearchResponse> {
    const { llmLane, ...callOpts } = opts ?? {}
    return this.request<ResearchResponse>({
      // LOT (15/10) DATA-C — voie « lot » (Message Batches, moitié prix) pour
      // un appelant de FOND : en-tête seulement, absent = requête à l'octet.
      ...(llmLane ? { headers: { [LLM_LANE_HEADER]: llmLane } } : {}),
      urlInfo: { template: '/phase/1/research' },
      body: {
        company_name: input.companyName,
        // Le SIREN de l'entité choisie. Le contrat le portait depuis toujours et
        // ce corps ne l'envoyait PAS : sur le chemin « Rafraîchir », la phase 1
        // repartait donc du nom seul, et pour un nom ambigu (« FRANCE
        // TELEVISIONS » a cinq homonymes au registre) la désambiguïsation ne
        // tranche pas — les sources ancrées sur le SIREN, dont les marchés
        // publics attribués, ne trouvaient rien. Clé omise quand il est absent.
        ...(input.siren ? { siren: input.siren } : {}),
        profile_data: input.profileData,
        user_context: input.userContext ?? null,
        account_id: input.accountId,
        user_id: input.userId,
        // Portée équipe du RAG — clé omise quand absente (wire byte-identique).
        ...(input.workspaceId ? { workspace_id: input.workspaceId } : {}),
        // Couche zéro (annexe méthodo p8) : clé omise sans historique CRM — wire
        // byte-identique pour tout workspace sans CRM connecté.
        ...(input.crmPresence ? { crm_presence: input.crmPresence } : {}),
        ...(input.internalHistory ? { internal_history: input.internalHistory } : {}),
        // #3753.3 — ciblage de l'ESN (hypothèses du vendeur) : clé omise sans ciblage.
        ...(input.sellerHypotheses ? { seller_hypotheses: input.sellerHypotheses } : {}),
        // Boucle d'apprentissage (§6) : clé omise quand l'équipe n'a rien
        // déplacé → wire byte-identique.
        ...(input.workspaceLearning ? { workspace_learning: input.workspaceLearning } : {}),
        // Kanban commercial (annexe méthodo p6) : clé omise pour un compte non
        // trié — wire byte-identique. Présente, elle sort la relation du froid.
        ...(input.commercialStatus ? { commercial_status: input.commercialStatus } : {}),
        ...(input.watchRefresh ? { watch_refresh: true } : {}),
        // Boards ATS (tome 2 §13) : le site permet de dériver le slug d'un board
        // Greenhouse/Lever sans le deviner. Clé omise quand on ne le connaît pas
        // — wire byte-identique sur un compte neuf.
        ...(input.website ? { website: input.website } : {}),
        // Axe CHEMIN (#1631.3/.4, lot 14) — clé omise sans couverture (ou sous le
        // seuil transverse) résolue par `MarketMemoryService` : wire byte-identique
        // pour tout compte que la mémoire marché n'a pas encore vu.
        ...(input.marketPathsObserved !== undefined ? { market_paths_observed: input.marketPathsObserved } : {}),
        ...(input.marketTopEsn ? { market_top_esn: input.marketTopEsn } : {}),
        // Axe RELATION (#2298.4, lot 19/09) — même discipline que l'axe CHEMIN
        // juste au-dessus : clés omises sans AUCUNE source réelle.
        ...(input.relationMissionsCount !== undefined ? { relation_missions_count: input.relationMissionsCount } : {}),
        ...(input.relationLastMeetingAt ? { relation_last_meeting_at: input.relationLastMeetingAt } : {}),
        ...(input.relationLastEmailAt ? { relation_last_email_at: input.relationLastEmailAt } : {}),
        ...(input.relationHumanCorrection ? { relation_human_correction: input.relationHumanCorrection } : {}),
        ...(input.declaredPartners?.length ? { declared_partners: input.declaredPartners } : {}),
        ...(input.consultantHistory ? { consultant_history: input.consultantHistory } : {}),
        ...(input.declaredSignalPresent ? { declared_signal_present: input.declaredSignalPresent } : {}),
        // #2371.4 — clé omise sans placement en cours → wire byte-identique.
        ...(input.partnerPlacementsActive ? { partner_placements_active: input.partnerPlacementsActive } : {}),
        // #3278.1 — clé omise sans signal → wire byte-identique.
        ...(input.routeSignals ? { declared_route_signals: input.routeSignals } : {}),
        // #4070.1/.4 — les faits du compte et l'analyse précédente : mêmes clés que
        // `analyzeGraph`, omises quand vides — wire byte-identique pour un compte
        // sans historique. Portaient déjà le graphe complet ; le chemin « Actualiser »
        // (on-demand) en repartait sans l'historique du compte.
        ...(input.accountFacts?.length
          ? {
              account_facts: input.accountFacts.map(f => ({
                kind: f.kind,
                label: f.label,
                date: f.date,
                age_days: f.ageDays,
              })),
            }
          : {}),
        ...(input.previousAnalysis ? { previous_analysis: input.previousAnalysis } : {}),
        progress_callback: input.progressCallback,
      },
      ...callOpts,
    })
  }

  /** Phase 2 — discover key contacts at the target company. */
  contacts(input: ContactsInput, opts?: IaCallOpts): Promise<ContactsResponse> {
    return this.request<ContactsResponse>({
      urlInfo: { template: '/phase/2/contacts' },
      body: {
        company_name: input.companyName,
        profile_data: input.profileData,
        account_id: input.accountId,
        user_id: input.userId,
        seed_contacts: (input.seedContacts ?? []).map(c => ({
          first_name: c.firstName,
          last_name: c.lastName,
          title: c.title,
          source: c.source,
          is_c_level: c.isCLevel,
        })),
        // S6 scope — narrow the Apollo search to a segment (persona/geo/entity/role).
        scope: input.scope,
        // C.2 (Cédric 20/10) — ancres d'organisation ; `undefined` = clé omise du JSON.
        organization_ids: input.organizationIds?.length ? input.organizationIds : undefined,
        organization_domains: input.organizationDomains?.length ? input.organizationDomains : undefined,
        progress_callback: input.progressCallback,
      },
      ...opts,
    })
  }

  /**
   * Quelle révision le service IA exécute — lue sur SON `/version`.
   *
   * L'IA est un service Railway distinct : quand un correctif IA est mergé et que
   * le bug persiste en ligne, rien ne distinguait « déployé et insuffisant » de
   * « pas encore redéployé », sauf à ouvrir Railway. Best-effort et borné : une
   * IA muette ou lente rend `null`, jamais une erreur — un écran d'état ne doit
   * pas tomber parce que la chose qu'il observe est en panne.
   */
  async version(): Promise<{ commit: string; environment: string } | null> {
    try {
      const res = await this.request<{ commit?: string; environment?: string }>({
        urlInfo: { template: '/version' },
        method: 'GET',
        timeoutMs: 2_000,
        maxAttempts: 1,
        // #2915.2 — un écran admin attend cette réponse ; ne jamais faire la
        // queue derrière une analyse de fond sur `LONG_CALL_DISPATCHER` (même
        // raison que `discoverRegistry`/`discoverSignals`, #2535.1). Mesuré en
        // production le 24/09 : 15 min de retard au démarrage d'une analyse.
        interactive: true,
      })
      return { commit: res?.commit ?? 'unknown', environment: res?.environment ?? 'unknown' }
    } catch {
      return null
    }
  }

  /**
   * #2009.11 — version STABLE d'un prompt (hash de template), lue AVANT
   * l'appel générateur pour entrer dans la clé d'idempotence
   * (`ProfileContextService.generationKey`) : distinguer un contexte généré
   * avec un ANCIEN prompt d'un NOUVEAU, sans dupliquer la source de vérité —
   * le registre de prompts vit côté IA (GA-26, `apps/ia/app/prompts/registry.py`).
   *
   * Best-effort et borné, comme `version()` ci-dessus : une IA muette ou un
   * nom non enregistré rendent `null`, jamais une erreur ni une valeur devinée.
   */
  async promptVersion(name: string): Promise<string | null> {
    try {
      const res = await this.request<{ version?: string | null }>({
        urlInfo: { template: `/config/prompt-version/${encodeURIComponent(name)}` },
        method: 'GET',
        timeoutMs: 2_000,
        maxAttempts: 1,
      })
      return res?.version ?? null
    } catch {
      return null
    }
  }

  /**
   * #2165.24 / #2166.3 / #2165.16 — le rôle capitalistique (`groupe` /
   * `filiale`) d'une entreprise et l'identité de sa tête de groupe, dérivés de
   * la cartographie Pappers déjà branchée (`GET
   * /companies/{siren}/group-affiliation`, apps/ia). Le moteur réutilise le
   * cache global par SIREN de `pappers.get_company` : un compte déjà analysé
   * ne coûte AUCUN appel Pappers supplémentaire.
   *
   * Best-effort et borné, comme `version()` ci-dessus : une IA muette, une
   * panne source, ou l'absence de clé Pappers rendent `null` — jamais une
   * erreur, jamais un rôle deviné. `applyResearch` n'écrase alors rien de
   * déjà connu.
   */
  async groupAffiliation(
    siren: string,
  ): Promise<{ role: 'groupe' | 'filiale'; headSiren: string; headName: string | null } | null> {
    try {
      const res = await this.request<{ role?: string; headSiren?: string; headName?: string | null } | null>({
        urlInfo: { template: `/companies/${encodeURIComponent(siren)}/group-affiliation` },
        method: 'GET',
        timeoutMs: 5_000,
        maxAttempts: 1,
      })
      if (!res || !res.headSiren || (res.role !== 'groupe' && res.role !== 'filiale')) return null
      return { role: res.role, headSiren: res.headSiren, headName: res.headName ?? null }
    } catch {
      return null
    }
  }

  /**
   * Lot 757 (arbitrage Louis 31/10) — le groupe et ses filiales (taille, siège, région), pour le sélecteur de
   * périmètre de l'analyse (`GET /companies/{siren}/group-perimeter`, apps/ia). Validé par le contrat partagé :
   * une réponse hors contrat, une IA muette ou une source sans clé rendent `null` — jamais un groupe deviné.
   */
  async groupPerimeter(siren: string): Promise<GroupPerimeter | null> {
    try {
      const res = await this.request<unknown>({
        urlInfo: { template: `/companies/${encodeURIComponent(siren)}/group-perimeter` },
        method: 'GET',
        timeoutMs: 15_000,
        maxAttempts: 1,
        interactive: true,
      })
      const parsed = groupPerimeterSchema.safeParse(res)
      return parsed.success ? parsed.data : null
    } catch {
      return null
    }
  }

  /**
   * Quelles capacités du moteur sont COUPÉES par un interrupteur d'arrêt.
   *
   * ⚠️ `null` quand le moteur n'a pas répondu, et l'appelant DOIT en faire
   * `unknown` — jamais « actif ». Un moteur muet ne prouve pas que ses capacités
   * tournent : ce serait le « non mesuré affiché zéro » transposé à une panne,
   * exactement le défaut que ce chemin existe pour corriger.
   *
   * ⚠️ La réponse ne porte que des identifiants de CAPACITÉ et des booléens —
   * aucun nom de variable, aucune valeur d'environnement. C'est vérifié des deux
   * côtés (`test_kill_switch_surface.py` côté moteur, GA-85 ici).
   */
  async killSwitches(): Promise<Record<string, boolean> | null> {
    try {
      const res = await this.request<{ switches?: Record<string, unknown> }>({
        urlInfo: { template: '/internal/kill-switches' },
        method: 'GET',
        timeoutMs: 2_000,
        maxAttempts: 1,
        // #2915.2 — le tableau de bord opérateur attend cette réponse en
        // direct ; même raison que `version()` juste au-dessus.
        interactive: true,
      })
      const raw = res?.switches
      if (!raw || typeof raw !== 'object') return null
      // Une valeur qui n'est pas un booléen n'est pas un « non » : on ne la
      // retient pas, et la capacité reste inconnue côté registre.
      const parsed: Record<string, boolean> = {}
      for (const [id, value] of Object.entries(raw)) {
        if (typeof value === 'boolean') parsed[id] = value
      }
      return parsed
    } catch {
      return null
    }
  }

  /**
   * Ce que chaque prompt IA a coûté depuis le démarrage du process — lu sur
   * `GET /metrics/cost` (`apps/ia/app/main.py`).
   *
   * Le trou que ça bouche : cette route existe côté moteur, répond à la
   * question juste (« qu'est-ce qui coûte cher hors pipeline d'analyse —
   * Copilote, discover, battlecard, weekly, compare, icebreaker, message,
   * summary, scorer, activity »), et n'avait AUCUN appelant dans les trois
   * applications — la famille n°1 de ce dépôt (« du code juste, calculé,
   * testé, que personne n'appelle ») appliquée à son propre instrument de
   * mesure.
   *
   * ⚠️ `null` quand le moteur n'a pas répondu, et l'appelant DOIT en faire
   * « inconnu » — jamais un total à zéro. Un moteur muet ne prouve pas que la
   * facture est nulle : ce serait le « non mesuré affiché zéro » transposé au
   * coût, exactement le défaut que ce chemin existe pour corriger. Voir
   * `killSwitches()` juste au-dessus, même contrat.
   *
   * ⚠️ Compteurs EN MÉMOIRE DU PROCESS FastAPI : ils repartent de zéro à
   * chaque redéploiement et ne sont PAS agrégés entre replicas — voulu et
   * documenté sur la route elle-même. Un ordre de grandeur lisible en direct,
   * pas une comptabilité.
   */
  async costMetrics(): Promise<IaCostMetrics | null> {
    try {
      const res = await this.request<RawIaCostMetrics>({
        urlInfo: { template: '/metrics/cost' },
        method: 'GET',
        timeoutMs: 2_000,
        maxAttempts: 1,
        // #2915.2 — même raison que `killSwitches()` juste au-dessus.
        interactive: true,
      })
      if (!res || typeof res !== 'object') return null
      const rawPrompts = Array.isArray(res.prompts) ? res.prompts : []
      const rawTruncations = res.truncations && typeof res.truncations === 'object' ? res.truncations : {}
      const truncations: IaCostMetrics['truncations'] = {}
      for (const [name, stats] of Object.entries(rawTruncations)) {
        if (!stats || typeof stats !== 'object') continue
        const s = stats as Record<string, unknown>
        truncations[name] = {
          events: numberOrZero(s['events']),
          wastedOutputTokens: numberOrZero(s['wasted_output_tokens']),
          wastedCostUsd: numberOrZero(s['wasted_cost_usd']),
        }
      }
      return {
        prompts: rawPrompts
          .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
          .map(p => ({
            prompt: stringOrEmpty(p['prompt']),
            calls: numberOrZero(p['calls']),
            inputTokens: numberOrZero(p['input_tokens']),
            outputTokens: numberOrZero(p['output_tokens']),
            cacheReadTokens: numberOrZero(p['cache_read_tokens']),
            cacheCreationTokens: numberOrZero(p['cache_creation_tokens']),
            costUsd: numberOrZero(p['cost_usd']),
            model: stringOrEmpty(p['model']),
            unpricedCalls: numberOrZero(p['unpriced_calls']),
          })),
        totalCostUsd: numberOrZero(res.total_cost_usd),
        truncations,
      }
    } catch {
      return null
    }
  }

  /** Phase 3 — batch-classify contacts (role + priority + summary + whyContact)
   *  and reconstruct the decision graph (BELLUM-ORGANIGRAMME). Apollo
   *  People-Match (email/phone) is on-demand only and lives in
   *  ``enrichContact`` below. */
  classify(input: ClassifyBatchInput, opts?: IaCallOpts): Promise<ClassifyBatchResponse> {
    return this.request<ClassifyBatchResponse>({
      urlInfo: { template: '/phase/3/classify' },
      body: {
        account_id: input.accountId,
        contacts: input.contacts,
        profile_data: input.profileData,
        // Profil du VENDEUR (annexe méthodo) : clé omise quand absente — l'IA
        // retombe alors sur profile_data, wire et prompt byte-identiques.
        ...(input.esnProfile ? { esn_profile: input.esnProfile } : {}),
        // Mémoire de corrections (A2) : clé omise quand vide — wire byte-identique.
        ...(input.accountFeedback ? { account_feedback: input.accountFeedback } : {}),
        // Mémoire du graphe (annexe §5) : la phase 3 reconstruit le graphe, elle
        // doit repartir de la bonne version et ne jamais réinjecter un élément
        // écarté. Clés omises quand il n'y a rien à se rappeler.
        ...(input.orgGraphVersion && input.orgGraphVersion > 1 ? { org_graph_version: input.orgGraphVersion } : {}),
        ...(input.orgRejectedItems?.length ? { org_rejected_items: input.orgRejectedItems } : {}),
        progress_callback: input.progressCallback,
      },
      ...opts,
    })
  }

  /** Phase 4 — produce the attack plan from aggregated research + enriched contacts. */
  plan(input: PlanInput, opts?: IaCallOpts): Promise<PlanResponse> {
    return this.request<PlanResponse>({
      urlInfo: { template: '/phase/4/plan' },
      body: {
        account_id: input.accountId,
        user_id: input.userId,
        // Portée équipe du RAG — clé omise quand absente (wire byte-identique).
        ...(input.workspaceId ? { workspace_id: input.workspaceId } : {}),
        account_data: input.accountData,
        contacts: input.contacts,
        profile_data: input.profileData,
        // Mémoire de corrections (A2) : clé omise quand vide — wire byte-identique.
        ...(input.accountFeedback ? { account_feedback: input.accountFeedback } : {}),
        // Couche zéro (annexe méthodo p7-p9) : historique CRM + ex-collaborateurs
        // de la cible. Clés omises quand vides — wire byte-identique.
        ...(input.crmPresence ? { crm_presence: input.crmPresence } : {}),
        ...(input.internalHistory ? { internal_history: input.internalHistory } : {}),
        // Boucle d'apprentissage (§6) : clé omise quand l'équipe n'a rien
        // déplacé → wire byte-identique.
        ...(input.workspaceLearning ? { workspace_learning: input.workspaceLearning } : {}),
        ...(input.channelPerformance?.length ? { channel_performance: input.channelPerformance } : {}),
        ...(input.reverseProspects?.length ? { reverse_prospects: input.reverseProspects } : {}),
        // "Changer de stratégie" (P3) — re-plan around a chosen angle/entry/entity.
        strategy_scope: input.strategyScope
          ? {
              angle: input.strategyScope.angle,
              entry_mode: input.strategyScope.entryMode,
              focus_entity: input.strategyScope.focusEntity,
              // #2947 (#2204.15) — mêmes contraintes de forme que le dialogue
              // « changer de stratégie », jusqu'aux messages batch M1-M2-M3.
              constraints: input.strategyScope.constraints,
              // #2947 (#2204.11) — l'objectif choisi rejoue M1-M2-M3 côté IA.
              objective: input.strategyScope.objective,
            }
          : undefined,
        // #4070.2/.4 — les faits du compte, les motifs de perte et l'analyse précédente :
        // mêmes clés que `analyzeGraph`, omises quand vides. Portaient déjà le graphe
        // complet ; le re-plan à la demande (« changer de stratégie ») en repartait sans
        // l'historique, donc sans gagné/perdu ni missions chez ce client.
        ...(input.accountFacts?.length
          ? {
              account_facts: input.accountFacts.map(f => ({
                kind: f.kind,
                label: f.label,
                date: f.date,
                age_days: f.ageDays,
              })),
            }
          : {}),
        ...(input.lostDealRex ? { lost_deal_rex: input.lostDealRex } : {}),
        ...(input.previousAnalysis ? { previous_analysis: input.previousAnalysis } : {}),
        progress_callback: input.progressCallback,
      },
      ...opts,
    })
  }

  /**
   * Run (or resume) the whole analysis through the LangGraph orchestrator,
   * yielding typed progress events as they stream over SSE. Replaces the four
   * sequential phase calls: the worker consumes these events and persists each
   * phase's output (carried in `phase_completed` events under `data.output`).
   * Single attempt; `opts.signal` (the job timeout / user-cancel) tears the
   * connection down.
   *
   * Each frame is validated against the DISCRIMINATED UNION in `@bellum/contracts`
   * (`graph-events.ts`), which models the seven event types the producer emits and
   * is pinned to a wire fixture the Python suite pins from the other side. `data`
   * used to be `z.record(z.string(), z.unknown())` — one opaque bag for seven different
   * payloads — which is how the producer and this consumer came to disagree about
   * where a failure's error object lived with nothing anywhere objecting. That
   * file carries the full history and the strictness policy applied below.
   */
  async *analyzeGraph(input: GraphAnalyzeInput, opts?: { signal?: AbortSignal }): AsyncGenerator<GraphEvent> {
    const stream = this.streamSse<unknown>({
      urlInfo: { template: '/graph/analyze' },
      body: {
        company_name: input.companyName,
        siren: input.siren ?? null,
        scope_mode: input.scopeMode ?? null,
        ...(input.scopeSelection ? { scope_selection: input.scopeSelection } : {}),
        // FR (default) omits `country` entirely so the French request body — and
        // therefore the French pipeline — is byte-identical to before this feature.
        // A non-FR market sends its 2-letter code, which the IA country packs read.
        ...(input.country ? { country: input.country } : {}),
        // Boards ATS (tome 2 §13) — clé omise quand le site est inconnu.
        ...(input.website ? { website: input.website } : {}),
        profile_data: input.profileData,
        user_context: input.userContext ?? null,
        // Mémoire de corrections (A2) : clé omise quand vide — wire byte-identique.
        ...(input.accountFeedback ? { account_feedback: input.accountFeedback } : {}),
        // Mémoire du graphe (Annexe Organigramme §5) : clés omises à leur valeur
        // neutre (version 1, aucun rejet) — wire byte-identique pour un compte
        // jamais corrigé.
        ...(input.orgGraphVersion && input.orgGraphVersion > 1 ? { org_graph_version: input.orgGraphVersion } : {}),
        ...(input.orgRejectedItems?.length ? { org_rejected_items: input.orgRejectedItems } : {}),
        // Couche zéro (annexe méthodo p8) : clé omise sans historique CRM.
        ...(input.crmPresence ? { crm_presence: input.crmPresence } : {}),
        ...(input.internalHistory ? { internal_history: input.internalHistory } : {}),
        // LUD.6 bis — la zone d'où le compte a été ouvert (ligne « zone : … » des critères
        // Découvrir) : les décideurs de la zone passent devant côté IA. Clé omise sans zone.
        ...openingZoneOf(input.sellerHypotheses),
        // #4070 — les faits du compte et ce qui en découle : chaque clé est omise quand elle est
        // vide, donc le wire d'un compte sans historique est byte-identique. Le wire n'a PAS de
        // champ de provenance : `kind`, `label`, `date`, `age_days` — rien d'autre ne sort.
        ...(input.accountFacts?.length
          ? {
              account_facts: input.accountFacts.map(f => ({
                kind: f.kind,
                label: f.label,
                date: f.date,
                age_days: f.ageDays,
              })),
            }
          : {}),
        ...(input.knownContacts?.length
          ? {
              known_contacts: input.knownContacts.map(c => ({
                name: c.name,
                role: c.role,
                relation: c.relation,
                last_seen: c.lastSeen,
              })),
            }
          : {}),
        ...(input.previousAnalysis ? { previous_analysis: input.previousAnalysis } : {}),
        ...(input.lostDealRex ? { lost_deal_rex: input.lostDealRex } : {}),
        // Boucle d'apprentissage (§6) : clé omise quand l'équipe n'a rien
        // déplacé → wire byte-identique.
        ...(input.workspaceLearning ? { workspace_learning: input.workspaceLearning } : {}),
        ...(input.channelPerformance?.length ? { channel_performance: input.channelPerformance } : {}),
        // #2451.1 — mode de contexte du dossier : clé omise en « Mon activité ».
        ...(input.contextMode ? { context_mode: input.contextMode } : {}),
        // Focus du plan réglé par l'espace : clé omise quand rien n'est réglé →
        // wire byte-identique, et l'IA applique les valeurs du contrat.
        ...(input.focusWeights && Object.keys(input.focusWeights).length > 0
          ? { focus_weights: input.focusWeights }
          : {}),
        // Kanban commercial (annexe méthodo p6) : clé omise pour un compte non
        // trié (`inbox`) — le wire d'un compte jamais rangé est byte-identique.
        ...(input.commercialStatus ? { commercial_status: input.commercialStatus } : {}),
        // Axe CHEMIN (#1631.3/.4, lot 14) — clé omise sans couverture (ou sous le
        // seuil transverse) résolue par `MarketMemoryService` : wire byte-identique
        // pour tout compte que la mémoire marché n'a pas encore vu.
        ...(input.marketPathsObserved !== undefined ? { market_paths_observed: input.marketPathsObserved } : {}),
        ...(input.marketTopEsn ? { market_top_esn: input.marketTopEsn } : {}),
        // Axe RELATION (#2298.4, lot 19/09) — clés omises sans AUCUNE source
        // réelle résolue par `AnalysisService.resolveRelationAxis` : wire
        // byte-identique pour tout compte que ni le CRM ni ces sources n'ont
        // trouvé.
        ...(input.relationMissionsCount !== undefined ? { relation_missions_count: input.relationMissionsCount } : {}),
        ...(input.relationLastMeetingAt ? { relation_last_meeting_at: input.relationLastMeetingAt } : {}),
        ...(input.relationLastEmailAt ? { relation_last_email_at: input.relationLastEmailAt } : {}),
        ...(input.relationHumanCorrection ? { relation_human_correction: input.relationHumanCorrection } : {}),
        ...(input.declaredPartners?.length ? { declared_partners: input.declaredPartners } : {}),
        ...(input.consultantHistory ? { consultant_history: input.consultantHistory } : {}),
        ...(input.declaredSignalPresent ? { declared_signal_present: input.declaredSignalPresent } : {}),
        // #2371.4 — clé omise sans placement en cours → wire byte-identique.
        ...(input.partnerPlacementsActive ? { partner_placements_active: input.partnerPlacementsActive } : {}),
        // #3278.1 — clé omise sans signal → wire byte-identique.
        ...(input.routeSignals ? { declared_route_signals: input.routeSignals } : {}),
        // #3278.a — clé omise quand non lu → wire byte-identique.
        ...(input.accumulatedRouteCriteria ? { accumulated_route_criteria: input.accumulatedRouteCriteria } : {}),
        account_id: input.accountId,
        user_id: input.userId,
        // Portée équipe du RAG. Clé omise quand absente → wire byte-identique
        // pour un appelant qui ne la thread pas encore, et l'IA retombe sur la
        // portée per-user (jamais un élargissement).
        ...(input.workspaceId ? { workspace_id: input.workspaceId } : {}),
        // Clé omise quand absente : le wire d'un appelant qui ne borne pas son
        // run reste byte-identique, et l'IA retombe sur le thread historique.
        ...(input.runId ? { run_id: input.runId } : {}),
        resume: input.resume ?? false,
      },
      signal: opts?.signal,
      idleTimeoutMs: GRAPH_STREAM_IDLE_TIMEOUT_MS,
    })
    for await (const raw of stream) {
      const parsed = parseGraphEvent(raw)
      if (parsed.status === 'unknown_type') {
        // A frame from an IA newer than this API. Skipping is deliberate and is
        // the safe half of the policy in `graph-events.ts`: the two services
        // deploy independently, and throwing here would throw MID-STREAM after
        // phases had already been persisted, as an error that rides the retry
        // budget — re-running the whole expensive pipeline into the same frame.
        // Loud enough to find in the logs, quiet enough not to fail a good run.
        this.logger.warn('Unrecognised graph event type — skipped', {
          type: parsed.type,
          hint: 'the IA emits an event this API does not model yet; add it to graphEventSchema',
        })
        continue
      }
      yield parsed.event
    }
  }

  /** Autocomplete — scalar params, GET. Returns at most `limit` normalized
   *  suggestions (defaults to 5 server-side). `country` is omitted for the FR
   *  default (recherche-entreprises); a non-FR market delegates to the matching
   *  country pack on the IA side, so the query body stays byte-identical for FR. */
  searchCompanies(
    query: string,
    limit?: number,
    country?: string,
    opts?: IaCallOpts & { lens?: string },
  ): Promise<CompanySearchResponse> {
    // `lens` is a ranking hint, not a transport option — pull it out of `opts`
    // so it lands in the querystring rather than in the HTTP call config.
    // Omitted unless explicitly `esn`, keeping the generic query byte-identical.
    const { lens, ...callOpts } = opts ?? {}
    return this.request<CompanySearchResponse>({
      method: 'GET',
      urlInfo: {
        template: '/companies/search',
        query: {
          q: query,
          ...(limit !== undefined ? { limit: String(limit) } : {}),
          ...(country && country !== 'FR' ? { country } : {}),
          ...(lens === 'esn' ? { lens } : {}),
        },
      },
      ...callOpts,
    })
  }

  /** Broader company discovery for "similar companies to explore". Uses a
   *  less strict matching strategy than autocomplete on the IA side. */
  discoverCompanies(
    query: string,
    limit?: number,
    opts?: IaCallOpts & { nafCode?: string },
  ): Promise<CompanySearchResponse> {
    const { nafCode, ...callOpts } = opts ?? {}
    return this.request<CompanySearchResponse>({
      method: 'GET',
      urlInfo: {
        template: '/companies/discover',
        query: {
          q: query,
          ...(limit !== undefined ? { limit: String(limit) } : {}),
          // NAF filter → same-sector results (Théo p.41). Omitted when absent.
          ...(nafCode ? { naf_code: nafCode } : {}),
        },
      },
      // #2915.2 — l'écran « comptes similaires à explorer » attend cette
      // réponse ; même raison que `discoverRegistry`/`discoverSignals`
      // (#2535.1). Mesuré en production le 24/09 : 15 min de retard au
      // démarrage d'une analyse.
      interactive: true,
      ...callOpts,
    })
  }

  /**
   * Prefill the 10-question ESN onboarding from the company name the seller
   * just typed (« Kicklox » → questionnaire prérempli). Registry-grounded:
   * anything a source can't back stays absent, never invented.
   *
   * `options` carries the CLOSED value catalog ({@link ESN_ANSWER_OPTIONS})
   * IN the request, so the exact French strings live in ONE place
   * (`@bellum/contracts`) instead of being re-declared on the Python side —
   * the two can never drift. The API still re-validates the answer against the
   * same catalog before handing it to the browser.
   *
   * Short deadline / single attempt: a human is watching an onboarding spinner,
   * and the caller soft-fails to the manual questionnaire rather than retrying.
   *
   * #2640.1 — `email` (the signed-in seller's own address, never typed by
   * them here) lets the IA side prefer the web hit whose domain matches a
   * PROFESSIONAL address over the first name-search result. A generic
   * provider (gmail.com…) is ignored server-side — see `pick_website`.
   */
  prefillEsnProfile(
    input: { name: string; siren?: string | null; email?: string | null },
    opts?: IaCallOpts,
  ): Promise<EsnPrefillResponse> {
    return this.request<EsnPrefillResponse>({
      urlInfo: { template: '/companies/prefill' },
      timeoutMs: 20_000,
      maxAttempts: 1,
      // #2915.2 — un vendeur regarde un spinner d'onboarding (voir le
      // commentaire ci-dessus) ; ne jamais faire la queue derrière une
      // analyse de fond.
      interactive: true,
      body: {
        name: input.name,
        siren: input.siren ?? null,
        email: input.email ?? null,
        options: ESN_ANSWER_OPTIONS,
      },
      ...opts,
    })
  }

  /**
   * #2060.9 — reformule UNE réponse libre déjà tapée. Geste explicite, single
   * attempt : un commercial regarde un bouton chargé, une tentative rejouée
   * automatiquement sur timeout ferait patienter deux fois plus longtemps pour
   * le même risque d'échec. `data.reformulated` — jamais deviné : l'IA renvoie
   * une erreur HTTP plutôt qu'une reformulation fabriquée, et `request` la
   * laisse remonter telle quelle jusqu'au contrôleur.
   */
  async reformulateOnboardingAnswer(
    input: { questionLabel: string; answerText: string; locale: 'fr' | 'en' },
    opts?: IaCallOpts,
  ): Promise<OnboardingReformulateResponse> {
    const envelope = await this.request<{ success: boolean; data?: { reformulated?: unknown } }>({
      urlInfo: { template: '/onboarding/reformulate-answer' },
      timeoutMs: 20_000,
      maxAttempts: 1,
      // #2915.2 — « un commercial regarde un bouton chargé » (voir le
      // commentaire ci-dessus) ; ne jamais faire la queue derrière une
      // analyse de fond.
      interactive: true,
      body: {
        question_label: input.questionLabel,
        answer_text: input.answerText,
        locale: input.locale,
      },
      ...opts,
    })
    const parsed = onboardingReformulateResponseSchema.safeParse(envelope?.data)
    if (!parsed.success) {
      // Un succès HTTP qui ne porte pas de reformulation lisible n'est PAS un
      // succès produit — même règle que `prefillEsnProfile` (§#2028.6) : on ne
      // laisse jamais passer une forme qu'on n'a pas su lire.
      throw new Error('malformed_reformulate_response')
    }
    return parsed.data
  }

  /**
   * #4405.1 — la réponse à un fil de la boîte de l'utilisateur, déjà rédigée
   * (« Préparer la réponse »). Geste explicite, une seule tentative, comme
   * `reformulateOnboardingAnswer` : l'IA répond par une erreur HTTP plutôt que
   * par un texte fabriqué, et `request` la laisse remonter jusqu'au contrôleur.
   */
  async draftMailReply(
    input: {
      counterpart?: string
      subject: string | null
      messages: ReadonlyArray<{
        direction: 'inbound' | 'outbound'
        from: string | null
        date: string | null
        text: string
      }>
      locale: 'fr' | 'en'
    },
    opts?: IaCallOpts,
  ): Promise<MailReplyDraftResult> {
    const envelope = await this.request<{ success: boolean; data?: unknown }>({
      urlInfo: { template: '/mail/reply-draft' },
      timeoutMs: 30_000,
      maxAttempts: 1,
      interactive: true,
      body: {
        ...(input.counterpart ? { counterpart: input.counterpart } : {}),
        subject: input.subject,
        messages: input.messages,
        locale: input.locale,
      },
      ...opts,
    })
    const parsed = mailReplyDraftResultSchema.safeParse(envelope?.data)
    if (!parsed.success) throw new Error('malformed_mail_reply_response')
    return parsed.data
  }

  /**
   * Chantier « briefs comptes » (01/10/2026) — le brief commercial d'un compte
   * dont l'analyse vient de se terminer (`CommercialBriefStep`). Hors chemin
   * critique : appel de FOND (jamais `interactive`), une seule tentative — un
   * rejeu repaierait un appel Sonnet pour le même risque d'échec, et le
   * dossier est déjà livré. 3 min : ~8 000 tokens de sortie.
   *
   * `brief` reste `unknown` ICI : la forme et les contrôles métier se jugent
   * dans le step, au seul endroit qui décide d'écrire.
   */
  async commercialBrief(
    input: {
      accountName: string
      headquarters: { value: string; source: string } | null
      dossier: Record<string, unknown>
      internalFacts: Record<string, unknown>
    },
    opts?: IaCallOpts,
  ): Promise<{ brief: unknown; inputChars: number | null; costUsd: number | null }> {
    const envelope = await this.request<{
      success?: boolean
      data?: { brief?: unknown; input_chars?: unknown; cost_usd?: unknown }
    }>({
      urlInfo: { template: '/commercial-brief' },
      // 12/10/2026 — DOIT dépasser le délai IA total (enrichissement web + appel
      // modèle à 300 s, `_MODEL_TIMEOUT_S` de `commercial_brief.py`). Le client
      // texte de l'IA coupait à 60 s : tous les briefs de prod mouraient en 502.
      // Hors chemin critique (`void` après `analysis:done`) : aucune latence
      // ajoutée au dossier.
      timeoutMs: 360_000,
      maxAttempts: 1,
      body: {
        account_name: input.accountName,
        headquarters: input.headquarters,
        dossier: input.dossier,
        internal_facts: input.internalFacts,
      },
      ...opts,
    })
    const data = envelope?.data
    if (!data || typeof data.brief !== 'object' || data.brief === null) throw new Error('malformed_commercial_brief')
    return {
      brief: data.brief,
      inputChars: typeof data.input_chars === 'number' ? data.input_chars : null,
      costUsd: typeof data.cost_usd === 'number' ? data.cost_usd : null,
    }
  }

  /**
   * #4078 — les blocs 01/14/15 du dossier complet d'un compte dont l'analyse
   * vient de se terminer (`DossierBlocksStep`). Même profil que
   * `commercialBrief` : appel de FOND, une seule tentative (un rejeu repaierait
   * l'appel modèle), 6 min (sortie jusqu'à 8 000 tokens, une reprise possible).
   *
   * `blocks` reste brut ICI : le filtre (forme, fournisseurs nommés) se fait dans
   * le step, au seul endroit qui décide d'écrire.
   */
  async dossierBlocks(
    input: { accountName: string; dossier: Record<string, unknown> },
    opts?: IaCallOpts,
  ): Promise<{ blocks: Record<string, unknown>; costUsd: number | null }> {
    const envelope = await this.request<{ success?: boolean; data?: { blocks?: unknown; cost_usd?: unknown } }>({
      urlInfo: { template: '/dossier-blocks' },
      // 16/10/2026 : le service IA a 300 s de délai modèle (`_MODEL_TIMEOUT_S`) + une reprise.
      timeoutMs: 360_000,
      maxAttempts: 1,
      body: { account_name: input.accountName, dossier: input.dossier },
      ...opts,
    })
    const blocks = envelope?.data?.blocks
    if (!blocks || typeof blocks !== 'object' || Array.isArray(blocks)) throw new Error('malformed_dossier_blocks')
    const cost = envelope?.data?.cost_usd
    return { blocks: blocks as Record<string, unknown>, costUsd: typeof cost === 'number' ? cost : null }
  }

  /** Profiler — fire-and-forget; result is persisted server-side. Pass
   *  `progressCallback` to opt into real-time phase streaming over Socket.IO.
   *
   *  Long timeout (2 min) because the agent paces 4 phase emissions over ~12 s
   *  after Claude returns. Single attempt to avoid duplicate socket streams. */
  generateProfile(
    input: {
      userId: string
      firstName?: string | null
      answers: EsnAnswers
      /** #2007.8 — les outils RÉELLEMENT branchés (`ToolRegistryService.list`),
       *  distincts des réponses `tooling_*` déclaratives déjà portées par
       *  `answers`. ADDITIF : absent dégrade en `[]`, jamais deviné. */
      connectedTools?: readonly string[]
      /** #2007.3 — les BU que le membre PORTE dans son espace actif
       *  (`BusinessUnitsReader`, borné espace + utilisateur). ADDITIF : absent
       *  dégrade en `[]`, jamais un périmètre deviné. */
      businessUnits?: readonly AnalysisBusinessUnit[]
      /** #2007.6/#2007.12 — une ligne « source, statut » par réponse connue de
       *  `answer_meta` (`deriveAnswerProvenanceForModel`, @bellum/contracts).
       *  ADDITIF : absent dégrade en `[]`, jamais une provenance devinée. */
      answerProvenanceLines?: readonly string[]
      /** #2007.7 — les clés dont la valeur vient d'une source EXTERNE
       *  (registre, Pappers, site, déduction, connecteur) plutôt que d'une
       *  saisie. ADDITIF : absent dégrade en `[]`. */
      importedContextKeys?: readonly string[]
      /** #2007.10 — les clés que l'utilisateur a CORRIGÉES après une première
       *  valeur (`answer_meta.status === 'corrected'`). ADDITIF : absent
       *  dégrade en `[]`. */
      correctedAnswersLines?: readonly string[]
      /** #2007.11 — les clés que l'utilisateur a volontairement PASSÉES
       *  (`ProfileQuestionnaireDialog.tsx`, bouton « passer »), résolues par
       *  l'appelant (`ProfileContextService.resolveSkippedQuestions`). ADDITIF :
       *  absent dégrade en `[]`, jamais une clé passée inventée. */
      skippedQuestionKeys?: readonly string[]
      progressCallback?: { url: string; userId: string }
    },
    opts?: IaCallOpts,
  ): Promise<ProfilerEnvelope> {
    return this.request<ProfilerEnvelope>({
      urlInfo: { template: '/profiler/generate' },
      timeoutMs: 120_000,
      maxAttempts: 1,
      body: {
        user_id: input.userId,
        // Théo O onboarding-couverture — « comment Laura t'appelle » (réponse V23) gagne sur le prénom du compte.
        first_name: input.answers.first_name ?? input.firstName ?? null,
        esn_name: input.answers.esn_name ?? '',
        consultant_size: input.answers.consultant_size ?? '',
        sales_team_size: input.answers.sales_team_size ?? '',
        expertise_areas: input.answers.expertise_areas,
        positioning: input.answers.positioning ?? '',
        staffing_model: input.answers.staffing_model ?? '',
        target_sectors: input.answers.target_sectors,
        target_company_types: input.answers.target_company_types,
        geo_zones: input.answers.geo_zones,
        main_sales_pain: input.answers.main_sales_pain ?? '',
        // #2007 — au-delà des dix champs Temps-1 : `EsnAnswers` porte déjà le
        // complément Temps-2 et le profil progressif (§21-30), mais rien ne les
        // envoyait ici — `OnboardingAnswers` (apps/ia/app/routers/profiler.py)
        // les déclare maintenant, en miroir. ADDITIF SEULEMENT : absent/`null`
        // dégrade en `null` / `[]`, jamais une valeur inventée.
        offer_domain: input.answers.offer_domain ?? null,
        offer_domains: input.answers.offer_domains,
        recruits_for_clients: input.answers.recruits_for_clients ?? null,
        // #4270.1 (18/10) — le profil d'espace (`staffing` / `forfait_conseil`), absent = `null`.
        workspace_profile: input.answers.workspace_profile ?? null,
        decision_maker_personas: input.answers.decision_maker_personas ?? [],
        avg_sales_cycle: input.answers.avg_sales_cycle ?? null,
        avg_tjm: input.answers.avg_tjm ?? null,
        client_references: input.answers.client_references ?? [],
        no_go_sectors: input.answers.no_go_sectors ?? [],
        user_role: input.answers.user_role ?? null,
        role_tenure: input.answers.role_tenure ?? null,
        industry_tenure: input.answers.industry_tenure ?? null,
        individual_goal: input.answers.individual_goal ?? null,
        monthly_target: input.answers.monthly_target ?? null,
        company_age: input.answers.company_age ?? null,
        company_size: input.answers.company_size ?? null,
        consultants_on_mission: input.answers.consultants_on_mission ?? null,
        consultants_in_pipe: input.answers.consultants_in_pipe ?? null,
        team_overlap: input.answers.team_overlap ?? null,
        ramp_up_capacity: input.answers.ramp_up_capacity ?? null,
        avg_deal_size: input.answers.avg_deal_size ?? null,
        target_margin: input.answers.target_margin ?? null,
        portfolio_size: input.answers.portfolio_size ?? null,
        accounts_relationship_status: input.answers.accounts_relationship_status ?? null,
        weekly_calls: input.answers.weekly_calls ?? null,
        weekly_emails: input.answers.weekly_emails ?? null,
        weekly_linkedin: input.answers.weekly_linkedin ?? null,
        proactivity_level: input.answers.proactivity_level ?? null,
        public_sector_practice: input.answers.public_sector_practice ?? null,
        regulated_sector_readiness: input.answers.regulated_sector_readiness ?? null,
        partner_relationship: input.answers.partner_relationship ?? null,
        go_to_market_channels: input.answers.go_to_market_channels ?? [],
        sales_routine: input.answers.sales_routine ?? [],
        sales_blockers: input.answers.sales_blockers ?? [],
        tooling: input.answers.tooling ?? [],
        shared_data_scope: input.answers.shared_data_scope ?? [],
        // #2058.2 / #2058.10 — les moments acceptés et le niveau de détail
        // attendu. ADDITIF, même règle que `proactivity_level`/
        // `shared_data_scope` juste au-dessus.
        contact_windows: input.answers.contact_windows ?? [],
        detail_level: input.answers.detail_level ?? null,
        // #2032.10 / #2036.9 — fonctions réellement exercées + ambition
        // territoriale déclarée. ADDITIF, jamais fusionnées avec `geo_zones`
        // (#2036.10, garde GA-338).
        role_functions_practiced: input.answers.role_functions_practiced ?? [],
        growth_target_zones: input.answers.growth_target_zones ?? [],
        // #2034 / #2035 — maturité commerciale déclarée + effectif réel (lot
        // L15). ADDITIF SEULEMENT, même règle que le bloc au-dessus.
        esn_maturity_situation: input.answers.esn_maturity_situation ?? null,
        company_growth_goal: input.answers.company_growth_goal ?? null,
        active_clients_band: input.answers.active_clients_band ?? null,
        revenue_recurrence: input.answers.revenue_recurrence ?? null,
        client_concentration_risk: input.answers.client_concentration_risk ?? null,
        consultants_managed_by_user_band: input.answers.consultants_managed_by_user_band ?? null,
        available_consultants_band: input.answers.available_consultants_band ?? null,
        // #2035.1 / #2035.2 — de quelle population ce chiffre parle. ADDITIF.
        consultant_size_group_band: input.answers.consultant_size_group_band ?? null,
        consultant_size_business_unit_band: input.answers.consultant_size_business_unit_band ?? null,
        // Lot 26 (#2038, #2039, #2040, #2041) — offre en types de prestation,
        // secteurs référencés, crédibilité et modes de réponse au besoin.
        // Même règle ADDITIVE : absent dégrade en `[]`, jamais une valeur
        // inventée. `OnboardingAnswers` (apps/ia/app/routers/profiler.py) les
        // déclare en miroir.
        service_types: input.answers.service_types ?? [],
        service_types_proven: input.answers.service_types_proven ?? [],
        service_types_desired: input.answers.service_types_desired ?? [],
        reference_sectors: input.answers.reference_sectors ?? [],
        // #2041.1 — même règle additive : le niveau le plus fort voyage avec
        // les secteurs de référence, sinon le prompt lirait une clé absente.
        priority_sectors: input.answers.priority_sectors ?? [],
        case_study_results: input.answers.case_study_results ?? [],
        client_testimonials: input.answers.client_testimonials ?? [],
        // #2961 (#2302.28) — même règle additive que ses deux voisines.
        reference_accounts: input.answers.reference_accounts ?? [],
        // #2039.6 (épopée #2880, feat/nuit-14-25-09) — posée et projetée
        // (analysis.ts), pas encore lue par `bellum_profiler.py` (`onboarding-
        // question-consumers.ts`, `areas: []`) : transportée quand même, même
        // règle additive que ses voisines — un futur lot la branche, celui-ci
        // ne l'invente pas.
        expertise_no_concrete_proof: input.answers.expertise_no_concrete_proof ?? [],
        // #2039.2 (épopée #2880, feat/soir-s10-26-09) — même règle additive
        // que sa voisine ci-dessus.
        expertise_client_reference: input.answers.expertise_client_reference ?? [],
        // #2039.3/.4/.5 (épopée #2880, vague G lot g10) — même règle additive
        // que leurs voisines ci-dessus.
        expertise_personal_experience: input.answers.expertise_personal_experience ?? [],
        expertise_partner: input.answers.expertise_partner ?? [],
        expertise_talent_pool: input.answers.expertise_talent_pool ?? [],
        staffing_modes: input.answers.staffing_modes ?? [],
        profile_validation_methods: input.answers.profile_validation_methods ?? [],
        contractual_constraints: input.answers.contractual_constraints ?? [],
        // #2042 / #2043 / #2044 (lot L17) — client idéal, interlocuteurs,
        // chemins d'accès. Le lot les avait ENREGISTRÉS sans les transporter :
        // une question posée, stockée et jamais lue par le modèle est le
        // défaut n°1 du dépôt (#2007, vingt-cinq champs muets six mois). La
        // garde `question-keys-reach-the-model.test.ts` l'a attrapé ici.
        // Même règle ADDITIVE : absent dégrade en `null` / `[]`.
        ideal_client_size: input.answers.ideal_client_size ?? [],
        ideal_client_structure: input.answers.ideal_client_structure ?? [],
        ideal_client_maturity: input.answers.ideal_client_maturity ?? [],
        ideal_client_territory: input.answers.ideal_client_territory ?? [],
        ideal_client_accessibility: input.answers.ideal_client_accessibility ?? null,
        ideal_client_max_sales_cycle: input.answers.ideal_client_max_sales_cycle ?? null,
        ideal_client_min_deal_size: input.answers.ideal_client_min_deal_size ?? null,
        ideal_client_referencement_constraints: input.answers.ideal_client_referencement_constraints ?? [],
        ideal_client_current_state: input.answers.ideal_client_current_state ?? [],
        real_response_level: input.answers.real_response_level ?? null,
        budget_validator: input.answers.budget_validator ?? null,
        access_orienteur: input.answers.access_orienteur ?? null,
        entry_channels_dependency: input.answers.entry_channels_dependency ?? [],
        entry_channels_prerequisites: input.answers.entry_channels_prerequisites ?? [],
        entry_channels_saturation: input.answers.entry_channels_saturation ?? [],
        // Lot L19 (#2048 → #2055) — canaux, unités comptées, temps réel,
        // continuité des dossiers, chaîne d'outillage et freins. Ces 37
        // colonnes étaient écrites en base et jamais envoyées au modèle : la
        // garde `question-keys-reach-the-model.test.ts` (#2025.2) l'a attrapé
        // à l'intégration. Même règle ADDITIVE que les blocs ci-dessus.
        entry_channels_used: input.answers.entry_channels_used ?? [],
        // #2048.13 — la période par canal, migration 1794110000000.
        entry_channels_period: input.answers.entry_channels_period ?? [],
        entry_channels_measured: input.answers.entry_channels_measured ?? [],
        entry_channels_last_starts: input.answers.entry_channels_last_starts ?? [],
        entry_channels_time_split: input.answers.entry_channels_time_split ?? [],
        activity_measures_tracked: input.answers.activity_measures_tracked ?? [],
        activity_reference_period: input.answers.activity_reference_period ?? null,
        weekly_sales_time_declared: input.answers.weekly_sales_time_declared ?? null,
        weekly_sales_time_protected: input.answers.weekly_sales_time_protected ?? null,
        weekly_sales_time_residual: input.answers.weekly_sales_time_residual ?? null,
        weekly_sales_time_slots: input.answers.weekly_sales_time_slots ?? [],
        competing_workloads: input.answers.competing_workloads ?? [],
        workload_variability: input.answers.workload_variability ?? null,
        protected_slot_capacity: input.answers.protected_slot_capacity ?? null,
        dossier_continuity_practices: input.answers.dossier_continuity_practices ?? [],
        dossier_continuity_breaks: input.answers.dossier_continuity_breaks ?? [],
        tooling_crm: input.answers.tooling_crm ?? null,
        tooling_ats: input.answers.tooling_ats ?? null,
        tooling_erp: input.answers.tooling_erp ?? null,
        tooling_mailbox: input.answers.tooling_mailbox ?? null,
        tooling_calendar: input.answers.tooling_calendar ?? null,
        tooling_drive: input.answers.tooling_drive ?? null,
        tooling_spreadsheet: input.answers.tooling_spreadsheet ?? null,
        tooling_enrichment: input.answers.tooling_enrichment ?? null,
        tooling_sourcing_platform: input.answers.tooling_sourcing_platform ?? null,
        tooling_bi: input.answers.tooling_bi ?? null,
        tooling_personal_notes: input.answers.tooling_personal_notes ?? null,
        tooling_reference: input.answers.tooling_reference ?? null,
        tooling_reference_data: input.answers.tooling_reference_data ?? [],
        tooling_reference_freshness: input.answers.tooling_reference_freshness ?? null,
        tooling_reference_confidence: input.answers.tooling_reference_confidence ?? null,
        tooling_reference_export: input.answers.tooling_reference_export ?? null,
        tooling_duplicates: input.answers.tooling_duplicates ?? null,
        tooling_pain: input.answers.tooling_pain ?? null,
        // #4971.1 — les noms des outils maison (déclarés, jamais « branchés »).
        tooling_internal_names: input.answers.tooling_internal_names ?? [],
        sales_freins: input.answers.sales_freins ?? [],
        frein_attempted: input.answers.frein_attempted ?? null,
        frein_stopped: input.answers.frein_stopped ?? null,
        frein_stopped_reason: input.answers.frein_stopped_reason ?? null,
        // #2007.9 — la COMPLÉTUDE : combien de questions ont une réponse, sur
        // combien au total. Dérivée UNE FOIS (`computeAnswerCompleteness`,
        // `@bellum/contracts`) — jamais un pourcentage nu, les deux nombres
        // voyagent ensemble pour que le moteur (ou un test) n'ait jamais à
        // redemander le dénominateur ailleurs.
        answered_count: computeAnswerCompleteness(input.answers).answeredCount,
        total_question_count: computeAnswerCompleteness(input.answers).totalCount,
        // #2005.4 (DÉCISION Louis 17/09, lot CP2) — où l'ESN est implantée
        // (siège + bureaux). Même règle ADDITIVE : absent dégrade en `[]`.
        // Théo O onboarding-couverture (22/10) — les 26 clés neuves de la V23 ; ADDITIF : absent = `null` / `[]`.
        target_nature: input.answers.target_nature ?? [],
        target_size: input.answers.target_size ?? [],
        language_capabilities: input.answers.language_capabilities ?? [],
        priority_expertise: input.answers.priority_expertise ?? [],
        skill_technos: input.answers.skill_technos ?? [],
        activity_nature: input.answers.activity_nature ?? [],
        data_sources: input.answers.data_sources ?? [],
        tools: input.answers.tools ?? [],
        delivery_frictions: input.answers.delivery_frictions ?? [],
        recruiting_priorities: input.answers.recruiting_priorities ?? [],
        country_scope: input.answers.country_scope ?? [],
        account_access: input.answers.account_access ?? null,
        horizon: input.answers.horizon ?? null,
        success_target: input.answers.success_target ?? null,
        offer_pitch: input.answers.offer_pitch ?? null,
        workflow_pain: input.answers.workflow_pain ?? null,
        autonomy: input.answers.autonomy ?? null,
        context_policy: input.answers.context_policy ?? null,
        commercial_limits: input.answers.commercial_limits ?? null,
        currency: input.answers.currency ?? null,
        scope_level: input.answers.scope_level ?? null,
        scope_unit: input.answers.scope_unit ?? null,
        bench_status: input.answers.bench_status ?? null,
        geography_detail: input.answers.geography_detail ?? null,
        no_go: input.answers.no_go ?? null,
        company_locations: input.answers.company_locations ?? [],
        // #2088.12/.13 (DÉCISION Louis 18/09, point 16) — les deux premiers
        // vrais nombres. Même règle ADDITIVE : absent dégrade en `null`,
        // jamais un `0` inventé (GA-18/GA-19).
        consultant_count: input.answers.consultant_count ?? null,
        annual_revenue_amount: input.answers.annual_revenue_amount ?? null,
        annual_revenue_period: input.answers.annual_revenue_period ?? null,
        // #2007.8 — l'état RÉEL des connecteurs, résolu par l'appelant
        // (`ToolRegistryService.list`), pas une réponse d'`EsnAnswers`.
        connected_tools: input.connectedTools ?? [],
        // #2007.3 — le périmètre PORTÉ (nom, échelle, territoire, spécialités),
        // lu par `bellum_profiler.py` (bloc « Périmètre porté »). Rien d'autre
        // ne sort : ni membres, ni comptes rattachés, ni responsable.
        business_units: (input.businessUnits ?? []).map(unit => ({
          name: unit.name,
          kind: unit.kind,
          ...(unit.territory ? { territory: unit.territory } : {}),
          ...(unit.specialties?.length ? { specialties: unit.specialties } : {}),
        })),
        // #2007.6/#2007.7/#2007.10/#2007.12 — la provenance ET le statut de
        // chaque réponse connue de `answer_meta` (#2006.22), résolus par
        // l'appelant (`ProfileContextService.resolveAnswerProvenance`) via
        // `deriveAnswerProvenanceForModel` (@bellum/contracts, GA-26). ADDITIF :
        // absent/vide dégrade en `[]`, jamais une provenance devinée.
        answer_provenance_lines: input.answerProvenanceLines ?? [],
        imported_context_keys: input.importedContextKeys ?? [],
        corrected_answers_lines: input.correctedAnswersLines ?? [],
        // #2007.11 — les clés PASSÉES volontairement, résolues par l'appelant
        // (`ProfileContextService.resolveSkippedQuestions`). ADDITIF : absent
        // dégrade en `[]`, jamais une clé inventée.
        skipped_question_keys: input.skippedQuestionKeys ?? [],
        // #2037.1/.3/.4/.5/.6/.11 (lot EE, 18/09/2026) — « qui fait quoi » au-
        // delà du commercial. Même règle ADDITIVE : absent dégrade en `null`,
        // jamais deviné. Lues par `bellum_profiler.py` (_COMPLEMENT_SECTIONS,
        // « Qui fait quoi — l'équipe élargie »).
        associates_count: input.answers.associates_count ?? null,
        recruiters_team_size: input.answers.recruiters_team_size ?? null,
        delivery_team_size: input.answers.delivery_team_size ?? null,
        marketing_team_size: input.answers.marketing_team_size ?? null,
        ops_team_size: input.answers.ops_team_size ?? null,
        team_coordination_mode: input.answers.team_coordination_mode ?? null,
        progress_callback: input.progressCallback
          ? { url: input.progressCallback.url, userId: input.progressCallback.userId }
          : null,
      },
      ...opts,
    })
  }

  /**
   * Real per-provider `configured` flags for the IA-hosted data sources (Apollo,
   * France Travail, Brave, Firecrawl, Pappers, Serper, Tavily) — booleans derived
   * from the IA's own `os.environ`, NEVER the key values. The API can't read those
   * keys (they live on the IA service), so the Tool Registry asks the IA here to
   * report the honest status. Short timeout / single attempt: callers degrade to
   * "unknown" (⇒ coming_soon) on any failure, never inventing a "configured".
   */
  integrationStatus(opts?: IaCallOpts): Promise<IaIntegrationStatus> {
    return this.request<IaIntegrationStatus>({
      method: 'GET',
      urlInfo: { template: '/config/integrations' },
      timeoutMs: 2_000,
      maxAttempts: 1,
      ...opts,
    })
  }

  /**
   * #2445.2 (épopée #2766) — la politique de routage modèle EFFECTIVE, par
   * tâche canonique (fournisseur, modèle, réglage posé ou hérité). Lue par la
   * console d'opérations IA (`internal/admin/model-routing`), jamais par le
   * produit. Même prudence que {@link integrationStatus} : court timeout, une
   * seule tentative, l'appelant dégrade sur échec plutôt que d'inventer une
   * politique.
   */
  modelRoutingPolicy(opts?: IaCallOpts): Promise<IaModelRoutingPolicy> {
    return this.request<IaModelRoutingPolicy>({
      method: 'GET',
      urlInfo: { template: '/config/model-routing' },
      timeoutMs: 2_000,
      maxAttempts: 1,
      ...opts,
    })
  }

  /**
   * #2975 / #2440.82 — pose ou corrige la déclaration qu'UNE destination de
   * routage a été réévaluée (`provider` ou `provider:model`), sans passer
   * par la variable d'env + redéploiement qu'elle complète. Écrit sur l'IA
   * (`POST /config/model-routing/evals`, GA-26 : le schéma vit là-bas).
   * Pas de retry (une écriture rejouée deux fois doit rester explicite côté
   * appelant, jamais automatique sur un geste opérateur).
   */
  declareModelRoutingEval(
    destinationKey: string,
    declaredBy: string,
    note: string | null,
    opts?: IaCallOpts,
  ): Promise<{ ok: boolean }> {
    return this.request<{ ok: boolean }>({
      urlInfo: { template: '/config/model-routing/evals' },
      body: { destinationKey, declaredBy, note },
      timeoutMs: 2_000,
      maxAttempts: 1,
      ...opts,
    })
  }

  /**
   * #2445.1 (épopée #2766) — la LISTE des prompts enregistrés avec leur
   * version (hash de template canonique). Lue par la console d'opérations IA
   * (`internal/admin/prompt-registry`), jamais par le produit. Même prudence
   * que {@link modelRoutingPolicy} : court timeout, une seule tentative,
   * l'appelant dégrade sur échec plutôt que d'inventer une version.
   */
  promptRegistry(opts?: IaCallOpts): Promise<IaPromptRegistry> {
    return this.request<IaPromptRegistry>({
      method: 'GET',
      urlInfo: { template: '/config/prompt-registry' },
      timeoutMs: 2_000,
      maxAttempts: 1,
      ...opts,
    })
  }

  /**
   * #2445.1 (épopée #2766) — DIFF d'un prompt entre deux refs git (le diff de
   * son fichier golden committé) et commande de ROLLBACK associée, RENDUE
   * jamais exécutée. Lue par la console d'opérations IA
   * (`internal/admin/prompt-registry/:name/diff`), jamais par le produit.
   * Même prudence que {@link promptRegistry}.
   */
  promptRegistryDiff(name: string, refA: string, refB = 'HEAD', opts?: IaCallOpts): Promise<IaPromptRegistryDiff> {
    const query = new URLSearchParams({ ref_a: refA, ref_b: refB })
    return this.request<IaPromptRegistryDiff>({
      method: 'GET',
      urlInfo: { template: `/config/prompt-registry/${encodeURIComponent(name)}/diff?${query.toString()}` },
      timeoutMs: 2_000,
      maxAttempts: 1,
      ...opts,
    })
  }

  /**
   * #2445.4 (épopée #2766) — la matrice des droits de Laura, PAR OUTIL :
   * lecture / proposition / dépense, dérivée du classement réel du service IA
   * (`app/services/tool_permissions.py`, déménagé hors de `tests/` ce lot —
   * une seule source, GA-26). Lue par la console d'opérations IA
   * (`internal/admin/rights-matrix`), jamais par le produit. Même prudence
   * que {@link modelRoutingPolicy} : court timeout, une seule tentative,
   * l'appelant dégrade sur échec plutôt que d'inventer une matrice.
   */
  rightsMatrix(opts?: IaCallOpts): Promise<IaRightsMatrix> {
    return this.request<IaRightsMatrix>({
      method: 'GET',
      urlInfo: { template: '/config/rights-matrix' },
      timeoutMs: 2_000,
      maxAttempts: 1,
      ...opts,
    })
  }

  /**
   * #3274.5 (épopée #3274) — les identifiants de règle que
   * `method_corpus_governance.is_rule_active` consulte RÉELLEMENT au
   * retrieval (#3274.3), le SEUL fait que l'IA peut affirmer sur sa propre
   * gouvernance. Lue par la console d'opérations
   * (`internal/admin/method-corpus-governance`), jamais par le produit. Même
   * prudence que {@link rightsMatrix} : court timeout, une seule tentative,
   * l'appelant dégrade sur échec plutôt que d'inventer un branchement.
   */
  methodCorpusGovernance(opts?: IaCallOpts): Promise<IaMethodCorpusGovernance> {
    return this.request<IaMethodCorpusGovernance>({
      method: 'GET',
      urlInfo: { template: '/config/method-corpus-governance' },
      timeoutMs: 2_000,
      maxAttempts: 1,
      ...opts,
    })
  }

  /** Single-contact enrichment via Apollo. Match priority: `linkedin_url`, then
   *  full name + org (People-Match). When the identity is incomplete (role-persona
   *  placeholder / first-name-only) or the match misses, the IA falls back to a
   *  People-Search by `organization_name + title` to resolve the real person. The
   *  IA route is a POST with a JSON body (Pydantic `EnrichPersonRequest`). */
  enrichContact(input: EnrichContactInput, opts?: IaCallOpts & IaCostOpts): Promise<EnrichContactResponse> {
    return this.request<EnrichContactResponse>({
      urlInfo: { template: '/phase/2/enrich' },
      // Apollo's People-Match → People-Search cascade (+ optional SalesQL /
      // Dropcontact fallbacks) routinely runs 30–50 s on a real lookup. The
      // client default (30 s, 3 attempts) was wrong on both counts: it timed out
      // mid-cascade — surfacing a spurious « fournisseur injoignable » on calls
      // that would have succeeded a few seconds later — and, being a PAID,
      // MUTATING call, it must never retry: each retry starts a *second* Apollo
      // enrichment (double provider cost, double wall-time, up to 90 s worst
      // case). Single attempt, generous ceiling — same posture as the profiler /
      // prefill / status calls above. Callers may still override via `opts`.
      timeoutMs: 60_000,
      maxAttempts: 1,
      body: {
        // Apollo person id — the strongest key, forwarded when the contact was
        // sourced from People-Search (persisted in raw_data.apolloId). Lets the IA
        // People-Match BY ID instead of a fresh org+title search.
        apollo_id: input.apolloId ?? null,
        first_name: input.firstName ?? null,
        last_name: input.lastName ?? null,
        organization_name: input.organizationName ?? null,
        // Clean org anchors from the ACCOUNT (Apollo org id + registrable domain)
        // so the IA scopes People-Search precisely instead of fuzzy-matching a
        // messy entity label (retour Théo P0). Present-only.
        organization_id: input.organizationId ?? null,
        organization_domain: input.organizationDomain ?? null,
        linkedin_url: input.linkedinUrl ?? null,
        // Role/persona → the fallback search key when the name can't resolve.
        title: input.title ?? null,
      },
      ...opts,
    })
  }

  /**
   * E1 (#3698) — demander à Apollo le MOBILE, livré plus tard sur `webhookUrl`
   * (endpoint public signé de l'API). Payant côté Apollo seulement si un mobile
   * est rendu ; MUTANT, donc une seule tentative. Le numéro ne passe jamais par
   * cette réponse : `requested` dit seulement si la demande est partie.
   */
  revealContactPhone(
    input: {
      webhookUrl: string
      apolloId?: string
      linkedinUrl?: string
      firstName?: string
      lastName?: string
      organizationName?: string
    },
    opts?: IaCallOpts,
  ): Promise<{ requested: boolean; matched?: boolean; linkedin_url?: string | null; reason?: string | null }> {
    return this.request({
      urlInfo: { template: '/phase/2/enrich/reveal-phone' },
      timeoutMs: 30_000,
      maxAttempts: 1,
      body: {
        webhook_url: input.webhookUrl,
        apollo_id: input.apolloId ?? null,
        linkedin_url: input.linkedinUrl ?? null,
        first_name: input.firstName ?? null,
        last_name: input.lastName ?? null,
        organization_name: input.organizationName ?? null,
      },
      ...opts,
    })
  }

  /**
   * #2727 — « je tape un nom, je vois les homonymes, je choisis ». Recherche
   * GRATUITE (tier People-Search Apollo, `q_keywords`) : AUCUN crédit débité
   * ici — le reveal (email/téléphone, `enrichContact` ci-dessus) reste le
   * geste payant et séparé, sur l'homonyme CHOISI.
   *
   * La réponse IA est snake_case (`ApolloSearchHit`, wire Pydantic) ; ce
   * client la reconstruit en camelCase pour que l'appelant NestJS ne manipule
   * jamais les deux conventions. `status` reste TYPÉ (jamais deviné) : un
   * champ absent retombe sur `'empty'`, jamais sur `'ok'` (GA-18/19).
   */
  searchPeopleByName(input: SearchPeopleByNameInput, opts?: IaCallOpts): Promise<SearchPeopleByNameResult> {
    return this.request<{
      success?: boolean
      status?: string
      hits?: Array<{
        id?: string
        first_name?: string
        last_name_obfuscated?: string
        title?: string
        organization_name?: string
        city?: string
        country?: string
        has_email?: boolean
        has_phone?: boolean
      }>
    }>({
      urlInfo: { template: '/phase/2/people/search-by-name' },
      body: {
        full_name: input.fullName,
        organization_name: input.organizationName ?? null,
      },
      ...opts,
    }).then(raw => ({
      status: (raw.status ?? 'empty') as SearchPeopleByNameResult['status'],
      hits: (raw.hits ?? []).map(hit => ({
        id: hit.id ?? '',
        firstName: hit.first_name ?? '',
        lastNameObfuscated: hit.last_name_obfuscated ?? '',
        title: hit.title ?? '',
        organizationName: hit.organization_name ?? '',
        city: hit.city ?? '',
        country: hit.country ?? '',
        hasEmail: hit.has_email ?? false,
        hasPhone: hit.has_phone ?? false,
      })),
    }))
  }

  /**
   * Apollo Professional (02/11) — le poste d'UN contact relu par People-Match (parcours DATÉ ; 1 crédit par appel,
   * tracé par l'en-tête de coût). `state` vaut `in_post` | `left` | `unknown` ; `status` dit pourquoi un état manque
   * (`no_identifier`, `unmatched`, `unavailable`) — un échec n'est jamais un état, aucune probabilité.
   */
  employmentFreshness(
    input: { apolloId?: string; linkedinUrl?: string; employerRef: string },
    opts?: IaCallOpts,
  ): Promise<EmploymentFreshnessReading> {
    return this.request<{
      status?: string
      state?: string
      organization?: string | null
      left_on?: string | null
      credits?: number
    }>({
      urlInfo: { template: '/phase/2/people/employment-freshness' },
      body: {
        apollo_id: input.apolloId ?? null,
        linkedin_url: input.linkedinUrl ?? null,
        employer_ref: input.employerRef,
      },
      ...opts,
    }).then(raw => ({
      status: (['ok', 'no_identifier', 'unmatched', 'unavailable'].includes(raw.status ?? '')
        ? raw.status
        : 'unavailable') as EmploymentFreshnessReading['status'],
      state: (raw.state === 'in_post' || raw.state === 'left'
        ? raw.state
        : 'unknown') as EmploymentFreshnessReading['state'],
      organization: raw.organization?.trim() || null,
      leftOn: raw.left_on?.trim() || null,
      credits: raw.credits ?? 0,
    }))
  }

  /**
   * #4386 — la CASCADE de recherche par nom (base de contacts → registre des
   * dirigeants → recherche web, `apps/ia/app/services/person_name_search.py`).
   * Méthode à part de `searchPeopleByName` ci-dessus : ses appelants (fiche
   * talent, relecture d'employeur) se servent de `id` comme identifiant de la
   * base de contacts et gardent le chemin historique byte-identique.
   *
   * Aucun reveal payant ici. Une famille de sources ou un indice que le contrat
   * ne connaît pas ne traverse pas : l'écran ne nomme jamais une source devinée.
   */
  searchPersonByNameCascade(input: SearchPeopleByNameInput, opts?: IaCallOpts): Promise<SearchPeopleByNameResult> {
    return this.request<{
      success?: boolean
      status?: string
      hits?: Array<{
        id?: string
        first_name?: string
        last_name?: string
        last_name_obfuscated?: string
        title?: string
        organization_name?: string
        linkedin_url?: string
        city?: string
        country?: string
        has_email?: boolean
        has_phone?: boolean
        sources?: string[]
        match?: string
      }>
      sources_queried?: Array<{ family?: string; outcome?: string; count?: number }>
    }>({
      urlInfo: { template: '/phase/2/people/search-by-name' },
      body: {
        full_name: input.fullName,
        organization_name: input.organizationName ?? null,
        cascade: true,
      },
      ...opts,
    }).then(raw => ({
      status: (raw.status ?? 'empty') as SearchPeopleByNameResult['status'],
      hits: (raw.hits ?? []).map(hit => {
        const match = personNameMatchSchema.safeParse(hit.match)
        return {
          id: hit.id ?? '',
          firstName: hit.first_name ?? '',
          lastName: hit.last_name ?? '',
          lastNameObfuscated: hit.last_name_obfuscated ?? '',
          title: hit.title ?? '',
          organizationName: hit.organization_name ?? '',
          ...(hit.linkedin_url ? { linkedinUrl: hit.linkedin_url } : {}),
          city: hit.city ?? '',
          country: hit.country ?? '',
          hasEmail: hit.has_email ?? false,
          hasPhone: hit.has_phone ?? false,
          sources: (hit.sources ?? []).flatMap(source => {
            const family = personNameSourceFamilySchema.safeParse(source)
            return family.success ? [family.data] : []
          }),
          ...(match.success ? { match: match.data } : {}),
        }
      }),
      sourcesQueried: (raw.sources_queried ?? []).flatMap(entry => {
        const parsed = personNameSourceQueriedSchema.safeParse(entry)
        return parsed.success ? [parsed.data] : []
      }),
    }))
  }

  /**
   * #2809 (#2293.11, #2294.*) — découverte FRAÎCHE de contacts sur UN compte
   * déjà connu : des personnes jamais collectées, cherchées par critère
   * (rôles). UN appel = UN compte ; l'appelant boucle sur la sélection de
   * `/accounts`, jamais un lot envoyé d'un coup à l'IA.
   *
   * `seeds` arrive DÉJÀ au format `AnalysisContactSeed` (camelCase,
   * `fullName`/`apolloId`…) — le routeur IA le construit avec la MÊME
   * fonction que la collecte Phase 2 normale (`_apollo_hit_to_seed`), donc
   * aucune reconstruction ici, contrairement à `searchPeopleByName`
   * ci-dessus qui reçoit un ``ApolloSearchHit`` snake_case brut.
   */
  discoverContacts(
    input: DiscoverContactsInput,
    opts?: IaCallOpts,
  ): Promise<{ seeds: AnalysisContactSeed[]; status: string }> {
    return this.request<{ success?: boolean; seeds?: AnalysisContactSeed[]; status?: string }>({
      urlInfo: { template: '/phase/2/contacts/discover' },
      body: {
        company_name: input.companyName,
        organization_domain: input.organizationDomain ?? null,
        organization_id: input.organizationId ?? null,
        titles: input.titles ?? null,
      },
      ...opts,
    }).then(raw => ({
      seeds: raw.seeds ?? [],
      status: raw.status ?? 'empty',
    }))
  }

  // ── Browser-facing routers, proxied ────────────────────────────────────────
  // discover / chat / rag are called from the SPA, so they go through a
  // JWT-authenticated NestJS controller instead of hitting the IA host directly.
  // The controller derives `user_id` from the token (never the body) and this
  // client forwards the shared internal secret — so the IA routers can require
  // it. Keep these last so the security boundary is obvious.

  /**
   * Découvrir v2 — liste ANCRÉE SUR LE REGISTRE (NAF × département × effectif ×
   * ancienneté). Contrat : `agent_docs/discover-v2-contract.md`.
   *
   * Contrairement à {@link discover}, la réponse n'est pas une enveloppe
   * `{success, data}` mais directement le contrat partagé : chaque candidat porte
   * un SIREN vérifié, un score CALCULÉ avec ses facteurs, et `degraded[]` liste
   * toute source injoignable — jamais de repli silencieux sur du LLM.
   */
  discoverRegistry(
    input: {
      filters: DiscoverRegistryFilters
      limit?: number
      profileData: Record<string, unknown>
      // #2489.3/D1 — le bouton « chercher hors de ma cible ».
      includeOutOfTarget?: boolean
      // #4067 (reste) — SIREN dont l'espace actif détient un fait : l'IA ne les coupe pas à `limit`.
      spaceSirens?: string[]
      // #4433 — « revenir au strict » : aucun élargissement par paliers.
      strictCriteria?: boolean
      // #4430 — l'espace actif : seul sésame des offres fraîches (plafond quotidien par espace).
      spaceKey?: string
      // #4419.7 — l'appelant, posé par l'API : l'IA relit l'identité d'un employeur dans SON espace (jamais un client).
      userId?: string
      // #4793.1 — les candidats de la base COMMUNE (aucun champ d'espace, contrat strict).
      commonBaseCandidates?: DiscoverCommonBaseCandidate[]
      // #4791.2 — les NOMS de Market Memory ; l'IA les apparie au registre (SIREN certain) ou les écarte.
      marketMemoryNames?: Array<{ name: string; label: string; date?: string; nature?: 'mission' }>
    },
    opts?: IaCallOpts,
  ): Promise<DiscoverResponse> {
    return this.request<DiscoverResponse>({
      urlInfo: { template: '/discover/registry' },
      body: {
        filters: input.filters,
        ...(input.limit !== undefined ? { limit: input.limit } : {}),
        profile_data: input.profileData,
        ...(input.includeOutOfTarget !== undefined ? { includeOutOfTarget: input.includeOutOfTarget } : {}),
        ...(input.spaceSirens?.length ? { spaceSirens: input.spaceSirens } : {}),
        ...(input.strictCriteria === true ? { strictCriteria: true } : {}),
        ...(input.spaceKey ? { spaceKey: input.spaceKey } : {}),
        ...(input.userId ? { userId: input.userId } : {}),
        ...(input.commonBaseCandidates?.length ? { commonBaseCandidates: input.commonBaseCandidates } : {}),
        ...(input.marketMemoryNames?.length ? { marketMemoryNames: input.marketMemoryNames } : {}),
      },
      // #2535.1 — un commercial attend cet écran ; ne jamais faire la queue
      // derrière une analyse de fond qui tient un socket ouvert sur le pool
      // par défaut (mesuré en production le 17/09 : 73 s sous charge, 11,9 s
      // au repos, même requête). Voir `INTERACTIVE_DISPATCHER` (@bellum/http).
      interactive: true,
      ...opts,
    })
  }

  /**
   * Découvrir v2 — liste ancrée sur le SIGNAL (AO ouverts BOAMP, marchés
   * attribués DECP, recrutements France Travail) plutôt que sur le registre.
   * Même contrat de réponse que {@link discoverRegistry}.
   */
  discoverSignals(
    input: {
      filters: DiscoverSignalsRequest
      profileData: Record<string, unknown>
      // #3757 (reste) — les SIREN que l'espace appelant a déclarés
      // partenaires (`PartnerPipelineService.declaredSirens`), résolus par le
      // CONTRÔLEUR, jamais par ce client générique. Absent/vide = comportement
      // inchangé (`DiscoverSignalsRequest`, apps/ia, défaut à `[]`).
      declaredPartnerSirens?: string[]
      // #4067 (reste) — SIREN dont l'espace actif détient un fait : l'IA ne les coupe pas à `limit`.
      spaceSirens?: string[]
    },
    opts?: IaCallOpts,
  ): Promise<DiscoverResponse> {
    return this.request<DiscoverResponse>({
      urlInfo: { template: '/discover/signals' },
      body: {
        ...input.filters,
        profile_data: input.profileData,
        ...(input.declaredPartnerSirens?.length ? { declaredPartnerSirens: input.declaredPartnerSirens } : {}),
        ...(input.spaceSirens?.length ? { spaceSirens: input.spaceSirens } : {}),
      },
      // #2535.1 — même raison que `discoverRegistry` juste au-dessus.
      interactive: true,
      ...opts,
    })
  }

  /**
   * #4282.10 — le radar d'une technologie, la MÊME sortie que Laura
   * (`apps/ia/app/services/technology_radar.py`) : mêmes comptes, même ordre.
   * Rendue brute ; le contrôleur la valide contre `technologyRadarSchema`.
   */
  technologyRadar(technology: string, opts?: IaCallOpts): Promise<unknown> {
    return this.request<unknown>({
      urlInfo: { template: '/discover/technology-radar' },
      body: { technology },
      // #2535.1 — un commercial attend cet écran, même raison que `discoverSignals`.
      interactive: true,
      ...opts,
    })
  }

  /**
   * Étage 1 du référentiel ESN — résout un LOT de noms bruts au registre.
   *
   * Le service IA possède les clients de sources externes ; NestJS possède la
   * table. Aucune des deux moitiés ne franchit la frontière de l'autre.
   */
  esnResolve(
    input: { names: string[] },
    opts?: IaCallOpts,
  ): Promise<{
    entries: {
      inputName: string
      status: string
      reason?: string | null
      siren?: string | null
      legalName?: string | null
      nafCode?: string | null
      sizeClass?: string | null
      headcountTranche?: string | null
      headcountRange?: string | null
      establishmentCount?: number | null
      creationDate?: string | null
      city?: string | null
      department?: string | null
    }[]
  }> {
    return this.request({ urlInfo: { template: '/esn/resolve' }, body: { names: input.names }, ...opts })
  }

  /**
   * #3916.a — toutes les annonces BODACC d'un SIREN parues dans la plage
   * `[since, until]` (ISO), paginées côté IA. `failed` n'est JAMAIS un relevé
   * vide : l'appelant n'avance pas son curseur sur une panne ; `truncated` dit
   * que le plafond d'offset de la source a mordu.
   */
  publicRegistryBodacc(
    input: { siren: string; since: string; until: string },
    opts?: IaCallOpts,
  ): Promise<{
    announcements: {
      ref: string
      url: string | null
      date: string
      type: string | null
      kind: string
      tribunal: string | null
      label: string | null
    }[]
    truncated: boolean
    failed: boolean
  }> {
    return this.request({ urlInfo: { template: '/public-registry/bodacc' }, body: input, ...opts })
  }

  /**
   * #3921.a / #3921.b — le relevé Sirene du jour (établissements + tranche
   * d'effectif) et les ouvertures par rapport au relevé d'hier (`previous`).
   * `configured: false` = pas de clé INSEE, no-op strict ; `failed` n'est
   * JAMAIS un relevé vide.
   */
  publicRegistrySirene(
    input: {
      siren: string
      previous: { siret: string; isActive: boolean; periodStartDate: string | null; city: string }[] | null
    },
    opts?: IaCallOpts,
  ): Promise<{
    configured: boolean
    failed: boolean
    establishments: { siret: string; isActive: boolean; periodStartDate: string | null; city: string }[]
    headcountRange: string | null
    openings: { siret: string; date: string; label: string; url: string }[]
  }> {
    return this.request({ urlInfo: { template: '/public-registry/sirene' }, body: input, ...opts })
  }

  /**
   * #3920.8 — les marchés publics ATTRIBUÉS du compte (acheteur ou titulaire), datés,
   * avec une `ref` stable. `failed` n'est JAMAIS un relevé vide.
   */
  publicRegistryAwards(
    // LUD.1 — `pack` : le domaine de l'espace (absent = marchés IT, comme avant).
    input: { siren: string; name: string; pack?: string },
    opts?: IaCallOpts,
  ): Promise<{
    failed: boolean
    /** #3915.decp — notre limiteur a fait attendre : ni panne ni relevé (absent = IA d'avant ce lot). */
    deferred?: boolean
    /** #3915.decp — la raison machine d'une panne, jamais vide quand `failed`. */
    reason?: string | null
    awards: {
      ref: string
      date: string
      label: string
      /** #3915.decp — le compte est l'acheteur (`buyer`) ou un titulaire ; absent = `buyer`. */
      role?: 'buyer' | 'titulaire'
      winner: string | null
      buyer?: string | null
      url: string | null
    }[]
  }> {
    return this.request({ urlInfo: { template: '/public-registry/awards' }, body: input, ...opts })
  }

  /**
   * #3921.9 — les événements du registre national des entreprises (changement de dirigeant,
   * ouverture / fermeture d'établissement), datés PAR le registre. `configured: false` = pas
   * d'identifiants, no-op strict ; `failed` n'est JAMAIS un relevé vide.
   */
  publicRegistryRne(
    input: { siren: string },
    opts?: IaCallOpts,
  ): Promise<{
    configured: boolean
    failed: boolean
    events: { ref: string; kind: string; date: string; label: string; url: string }[]
  }> {
    return this.request({ urlInfo: { template: '/public-registry/rne-events' }, body: input, ...opts })
  }

  /**
   * #3921.10 — les marchés publics GAGNÉS par un SIREN (rôle titulaire), datés, de référence stable.
   * Aucun acheteur dans la réponse (décision Louis 16/10/2026). `failed` n'est JAMAIS un relevé vide.
   */
  publicRegistryAwardsWon(
    input: { siren: string },
    opts?: IaCallOpts,
  ): Promise<{
    failed: boolean
    awards: {
      ref: string
      date: string
      title: string | null
      durationMonths: number | null
      endsOn: string | null
    }[]
  }> {
    return this.request({ urlInfo: { template: '/public-registry/awards-won' }, body: input, ...opts })
  }

  /**
   * L'écran Territoire — cinq blocs, chacun avec son état (tome 4).
   *
   * La MAILLE voyage avec la demande depuis le 04/09/2026 : département (le
   * défaut), ville (code INSEE) ou cercle (point + rayon). Les champs sont
   * optionnels, donc un appelant qui ne les pose pas envoie un corps
   * byte-identique à celui d'avant.
   */
  territoryOverview(
    input: {
      department: string
      sinceDays: number
      knownEsnNames: string[]
      communeCode?: string
      communeName?: string
      latitude?: number
      longitude?: number
      radiusKm?: number
    },
    opts?: IaCallOpts,
  ): Promise<TerritoryOverview> {
    return this.request<TerritoryOverview>({
      urlInfo: { template: '/territory/overview' },
      body: input,
      ...opts,
    })
  }

  /**
   * Les communes dont le nom correspond — pour le champ « ville » de Territoire.
   *
   * Sert le CHOIX, il ne le fait pas : les homonymes restent tous proposés.
   * Retenir « Toulouse » pour qui a tapé « Toulouse » serait juste 99,9 % du
   * temps, et enverrait la recherche à 750 km une fois sur mille.
   */
  territoryCommunes(input: { q: string; limit?: number }, opts?: IaCallOpts): Promise<{ communes: unknown[] }> {
    return this.request<{ communes: unknown[] }>({
      urlInfo: {
        template: '/territory/communes',
        query: { q: input.q, limit: String(input.limit ?? 8) },
      },
      method: 'GET',
      ...opts,
    })
  }

  /**
   * La fiche de REGISTRE d'une entreprise — gratuite, sans crédit.
   *
   * Ce que le registre public dit d'une société : SIREN, adresse, effectif,
   * NAF, forme juridique, dirigeants. C'est ce qu'on ouvre AVANT de décider de
   * payer une analyse complète, sur un écran qui nomme quarante entreprises.
   */
  companyRegistryRecord(name: string, opts?: IaCallOpts): Promise<{ company: unknown; reason?: string | null }> {
    return this.request<{ company: unknown; reason?: string | null }>({
      method: 'GET',
      urlInfo: { template: '/companies/registry', query: { name } },
      ...opts,
    })
  }

  /** DEPRECATED — Discover v1 by free-text criteria (Brave + Claude), where the
   *  model invented the company names and the score. Kept until the SPA moves to
   *  {@link discoverRegistry}. */
  discover(input: { criteria: string; profileData: Record<string, unknown> }, opts?: IaCallOpts): Promise<IaEnvelope> {
    return this.request<IaEnvelope>({
      urlInfo: { template: '/discover/search' },
      body: { criteria: input.criteria, profile_data: input.profileData },
      ...opts,
    })
  }

  /**
   * Account-context advisor chat. `userId` comes from the JWT, not the body.
   *
   * Le budget d'un tour est un DÉFAUT de la méthode, pas une consigne laissée
   * à chaque appelant. La route web le posait bien chez elle ; la route MCP
   * (`POST /mcp/accounts/:id/ask`) ne le posait pas et tombait donc sur les
   * défauts du client HTTP — 30 s et trois tentatives. C'est le même copilote,
   * avec les mêmes outils : un tour qui lit une messagerie ou enrichit un
   * contact dépasse couramment 30 s, était coupé, puis rejoué deux fois.
   *
   * Un appelant reste libre de resserrer via `opts` (le spread suit) ; ce qu'il
   * ne peut plus faire, c'est OUBLIER. `maxAttempts: 1` pour la raison de fond :
   * un tour de copilote n'est pas idempotent — il facture un appel Claude et
   * peut exécuter un outil, donc le rejouer triple la dépense sans jamais
   * changer le verdict d'un dépassement de délai.
   */
  chat(
    input: ChatProxyInput,
    opts?: { signal?: AbortSignal; headers?: Record<string, string> } & IaCostOpts,
  ): Promise<IaEnvelope> {
    return this.collectChatEnvelope(this.chatStream(input, opts))
  }

  /**
   * Le service IA rend `/chat/message` en SSE (jamais deux formes pour un même
   * endpoint) : lire ce corps comme du JSON faisait tomber la route MCP
   * `ask_bellum` en 500 (« Unexpected token 'd', "data: {"ty"... »). On consomme
   * donc le flux jusqu'au bout et on rend l'enveloppe du DERNIER `done` — la
   * même forme qu'avant le passage au flux. Pas de `done` (flux coupé) =
   * `success: false`, jamais une réponse reconstituée à partir des deltas.
   */
  private async collectChatEnvelope(events: AsyncGenerator<ChatStreamEvent>): Promise<IaEnvelope> {
    let envelope: IaEnvelope = { success: false, data: {} }
    for await (const event of events) {
      if (event.type === 'done') envelope = { success: event.success, data: event.data }
    }
    return envelope
  }

  /**
   * Le corps de ``/chat/message`` — LA SEULE dérivation, partagée par `chat()`
   * (bufferisé — la route MCP, `POST /mcp/accounts/:id/ask`, en a besoin
   * telle quelle) et `chatStream()` (LOT STREAM — la route web). Deux chemins
   * qui la refont divergent au premier champ ajouté.
   */
  private chatBody(input: ChatProxyInput): Record<string, unknown> {
    return {
      user_id: input.userId,
      // Portée équipe du RAG — clé omise quand absente (wire byte-identique).
      ...(input.workspaceId ? { workspace_id: input.workspaceId } : {}),
      message: input.message,
      account_id: input.accountId ?? '',
      history: input.history ?? [],
      account_data: input.accountData ?? {},
      contacts_summary: input.contactsSummary ?? '',
      plan_summary: input.planSummary ?? '',
      accounts_summary: input.accountsSummary ?? '',
      profile_data: input.profileData ?? {},
      // Long memory (Théo P2) — pinned facts, user preferences and the rolling
      // conversation summary, resolved server-side so the advisor "remembers".
      // #1962.8 — COMPATIBILITÉ DE DÉPLOIEMENT : l'API et le service IA ne partent
      // pas au même instant, et un service IA pas encore redéployé valide
      // `pinned_facts: list[str]`. La forme historique reste donc des CHAÎNES ;
      // la nature et l'origine voyagent sous une clé NEUVE, `pinned_memory`, qu'un
      // service ancien ignore au lieu de rejeter tout le tour en 422.
      pinned_facts: (input.pinnedFacts ?? []).map(item => item.fact),
      ...(input.pinnedFacts?.length
        ? {
            // #3892.1 — `accountName` voyage sous une clé SNAKE_CASE, comme le
            // reste de ce corps : la forme camelCase de `PinnedMemoryContextItem`
            // ne traverse jamais telle quelle vers le service IA.
            pinned_memory: input.pinnedFacts.map(item => ({
              fact: item.fact,
              kind: item.kind,
              origin: item.origin,
              ...(item.confirmed ? { confirmed: item.confirmed } : {}),
              ...(item.accountName ? { account_name: item.accountName } : {}),
            })),
          }
        : {}),
      user_preferences: input.userPreferences ?? {},
      conversation_summary: input.conversationSummary ?? '',
      // Mémoire de corrections du compte (feedback loop A2), résolue server-side
      // par le chat-context. Vide = bloc non injecté côté IA (prompt inchangé).
      account_feedback: input.accountFeedback ?? '',
      // #3272.6 — REX de perte(s) déjà connu(s) sur ce compte, résolus
      // server-side par le chat-context. Vide = bloc non injecté (prompt inchangé).
      lost_deal_rex_context: input.lostDealRexContext ?? '',
      // #3390.10/.11 — la méthode retenue (texte), '' = bloc absent côté IA.
      commercial_method_context: input.commercialMethodContext ?? '',
      // #4071.1 — les faits du compte (socle #4069), '' = bloc absent côté IA.
      account_facts_context: input.accountFactsContext ?? '',
      // #3295 — règles APPRISES de l'espace (adoptées puis activées). Vide =
      // bloc non injecté (prompt inchangé, byte pour byte).
      workspace_learned_rules_context: input.workspaceLearnedRulesContext ?? '',
      workspace_recall_context: input.workspaceRecallContext ?? '',
      // Real integration state (chat transparency) — the IA turns this into the
      // honest "not consulted" list. Defaults to NOT connected so we never claim
      // a CRM link that doesn't exist.
      crm_connected: input.crmConnected ?? false,
      crm_provider: input.crmProvider ?? '',
      // Presence read-back (roadmap §8/§9) : real CRM records for the active
      // account. Empty = the CRM was NOT crossed for this reply.
      crm_presence: input.crmPresence ?? '',
      // #1915.11 — la lecture a été TENTÉE et a ÉCHOUÉ (panne, jamais « rien
      // trouvé »). `false` par défaut = panneau d'avant, byte pour byte.
      crm_unavailable: input.crmUnavailable ?? false,
      // Registre d'outils (Tool Registry v2) — digest compact des outils
      // connectés + coûts. Empty = bloc non injecté côté IA (prompt inchangé).
      tools_summary: input.toolsSummary ?? '',
      // #2261.21-32 — même contrat : "" = pas de bloc CAPACITÉS INTERNES,
      // prompt inchangé au byte près.
      internal_capabilities_summary: input.internalCapabilitiesSummary ?? '',
      // Le PRÉNOM (tome 6, D44) : le bloc de persona n'apparaît qu'avec lui.
      first_name: input.chatFirstName ?? '',
      // #2259.11 / #2259.4 / #2259.13 / #2259.6 — bloc identité NEUF côté IA
      // (`identity_context_block`, jamais un ajout dans `bellum_advisor.py`).
      // Clés omises quand l'appelant ne les connaît pas : corps byte-identique
      // pour toute route qui ne les fournit pas (même discipline que
      // `page_context` plus bas).
      ...(input.lastName ? { last_name: input.lastName } : {}),
      ...(input.workspaceRole ? { workspace_role: input.workspaceRole } : {}),
      ...(input.isAccountOwner ? { is_account_owner: true } : {}),
      ...(input.mentionedColleague ? { mentioned_colleague: input.mentionedColleague } : {}),
      // #2259.30 / #2259.32 / #2259.33 / #2259.34 / #2259.35 — la ou les BU
      // portées, avec ce que l'espace en sait. Clé OMISE sur une liste vide :
      // propriétaire sans BU, prompt inchangé (même discipline que les clés
      // identité juste au-dessus). Champs mappés en snake_case, comme partout
      // ailleurs à cette frontière.
      ...(input.businessUnits?.length
        ? {
            business_units: input.businessUnits.map(bu => ({
              name: bu.name,
              territory: bu.territory,
              specialties: bu.specialties,
              capacity: bu.capacity,
              quarter_objective: bu.quarterObjective,
              account_count: bu.accountCount,
              consultant_count: bu.consultantCount,
              reference_count: bu.referenceCount,
              team_size: bu.teamSize,
            })),
          }
        : {}),
      // LE FUSEAU DE LA PERSONNE (décision Louis, 14/09/2026). Clé OMISE quand
      // l'appelant ne le connaît pas — la route MCP ne le fournit pas — et le
      // service IA garde alors son fuseau de RÉFÉRENCE nommé
      // (`REFERENCE_TIMEZONE`, `apps/ia/app/prompts/current_time.py`) : corps
      // byte-identique, prompt byte-identique, exactement le comportement
      // d'avant ce lot. Même discipline que `connected_families` plus bas — une
      // clé omise n'est pas une clé vide, et un fuseau vide ne veut pas dire
      // UTC.
      ...(input.timezone ? { timezone: input.timezone } : {}),
      // #1958.2 — LE FUSEAU DE L'ESPACE. Même discipline que `timezone` juste
      // au-dessus : clé OMISE quand l'appelant ne le connaît pas, jamais une
      // clé vide (qui se lirait comme « fuseau UTC », faux).
      ...(input.workspaceTimezone ? { workspace_timezone: input.workspaceTimezone } : {}),
      // #2266.8 (épopée #2920) — même discipline que `workspace_timezone`
      // juste au-dessus : clé OMISE quand l'appelant ne la connaît pas.
      ...(input.workspaceCreatedAt ? { workspace_created_at: input.workspaceCreatedAt } : {}),
      // #2266.10 (épopée #2920) — même discipline que `workspace_created_at`
      // juste au-dessus : clé OMISE quand l'espace n'a encore aucune collecte
      // connue, jamais une date inventée.
      ...(input.workspaceLastSyncAt ? { workspace_last_sync_at: input.workspaceLastSyncAt } : {}),
      // Fichiers que l'utilisateur a JOINTS à la conversation. Le service IA
      // charge leur contenu lui-même (il possède la table) et le scope au
      // user/workspace : l'API ne fait que transmettre les identifiants.
      // Liste vide = clé envoyée vide = prompt IA inchangé.
      document_ids: input.documentIds ?? [],
      // #2148.16 — la pièce jointe de CONVERSATION (cas a) : transmise EN
      // CLAIR (le service IA ne la charge nulle part, elle est déjà là).
      // Liste vide = clé envoyée vide = prompt IA inchangé, même discipline
      // que `document_ids` juste au-dessus.
      attached_files: (input.attachedFiles ?? []).map(f => ({ name: f.name, text: f.text })),
      // Routeur étape 3 — la vérification de capacité en CODE côté IA. La clé
      // n'est envoyée QUE si l'appelant sait : absente, le service IA rend
      // tous les outils, et c'est le bon repli. Une liste vide voudrait dire
      // « rien n'est branché » et amputerait le copilote sur une panne de
      // registre.
      ...(input.connectedFamilies ? { connected_families: input.connectedFamilies } : {}),
      // L'écran ouvert, DÉJÀ RENDU en texte par l'appelant
      // (`renderLauraPageContext`). La clé n'est envoyée QUE si l'appelant en
      // a un : absente, le service IA n'ajoute aucun bloc et le prompt reste
      // byte-identique. Même discipline que `connected_families` juste
      // au-dessus — une clé omise n'est pas une clé vide.
      ...(input.pageContext ? { page_context: input.pageContext } : {}),
      clarification_asked: input.clarificationAsked ?? false,
      // #1960.20 — l'espace est en MARQUE BLANCHE : le service IA retire du
      // prompt l'adresse du support Bellum (décision de Louis du 13/09/2026). La
      // clé ne part QUE quand c'est vrai : absente = marque du produit, corps
      // byte-identique pour tous les autres espaces.
      ...(input.whiteLabel ? { white_label: true } : {}),
      // #1958.8 — clé OMISE quand l'appelant ne la connaît pas : le service IA
      // retombe sur "fr" lui-même (`bellum_advisor.build_system_prompt`),
      // exactement comme `connected_families` un peu plus haut.
      ...(input.interfaceLanguage ? { interface_language: input.interfaceLanguage } : {}),
      // #1951.2 — la fiche du périmètre objet. Clé OMISE sans portée objet :
      // corps byte-identique pour tous les autres tours.
      ...(input.scopeObject ? { scope_object: input.scopeObject } : {}),
      // #2453 — clé OMISE sans mode (même discipline que `scope_object`).
      ...(input.contextMode ? { context_mode: input.contextMode } : {}),
      // #3772.5 — l'exclusion stricte des données de l'espace : clé OMISE sinon.
      ...(input.excludeWorkspaceData ? { exclude_workspace_data: true } : {}),
      // #2450.1 (reste partiel, épopée #2882) — le MODE DE RECHERCHE, tel quel
      // (le service IA valide contre `RequestedMode` et ignore `'auto'`/toute
      // valeur inconnue). Clé OMISE sans mode (même discipline).
      ...(input.mode ? { mode: input.mode } : {}),
      // #3708 — clé OMISE sans exclusion (corps byte-identique à avant).
      ...(input.excludedToolFamilies?.length ? { excluded_families: input.excludedToolFamilies } : {}),
      // #3708.fournisseur — l'exclusion par OUTIL, déjà recoupée avec le registre.
      ...(input.excludedToolProviders?.length ? { excluded_providers: input.excludedToolProviders } : {}),
      // #3768 — le geste, sous la clé snake_case que `ChatRequest` DÉCLARE
      // (`reply_transform`). Clé OMISE sans geste (même discipline que `mode`).
      ...(input.replyTransform
        ? {
            reply_transform: {
              id: input.replyTransform.id,
              source_text: input.replyTransform.sourceText,
              layout: input.replyTransform.layout,
              account_ids: input.replyTransform.accountIds,
              reserves: input.replyTransform.reserves,
            },
          }
        : {}),
      // #4397 (N1) — l'objet d'une suite cliquée, sous la clé snake_case de `ChatRequest`. Clé OMISE sans suite.
      ...(input.followUpRef ? { follow_up_ref: { talent_id: input.followUpRef.talentId } } : {}),
      // #1950.17 — le plafond agrégé de la réponse. Clé OMISE quand l'appelant
      // ne le fournit pas : le service IA n'applique alors aucun plafond.
      ...(typeof input.replyCostCeiling === 'number' ? { reply_cost_ceiling: input.replyCostCeiling } : {}),
      // #1954.7 — le FIL courant. Clé OMISE sans fil : côté IA, aucun document
      // joint `scope: 'conversation'` ne peut alors être lu (fail closed).
      ...(input.conversationId ? { conversation_id: input.conversationId } : {}),
      // #1927.10 — l'état structuré du fil, sous la clé que `ChatRequest`
      // DÉCLARE (`thread_state`). Clé OMISE sans état : un service IA d'avant
      // #1927 l'ignorerait de toute façon, et le corps reste byte-identique.
      ...(input.threadState ? { thread_state: input.threadState } : {}),
      // #1919.15 — clé omise sans retour : le service IA n'ajoute aucun bloc,
      // le prompt reste byte-identique (même discipline que `page_context`).
      ...(input.replyFeedback ? { reply_feedback: input.replyFeedback } : {}),
    }
  }

  /**
   * LOT STREAM (12/09/2026) — LA MÊME requête que `chat()`, diffusée.
   *
   * Le service IA rend maintenant `/chat/message` en SSE (jamais deux formes
   * pour le même endpoint) : trois types d'événements, `delta` (un fragment du
   * texte final), `step` (un outil démarre) et `done` (la MÊME forme que
   * l'ancienne `IaEnvelope` bufferisée — TOUJOURS le dernier événement du
   * flux). Un appelant qui ne lirait que les `done` retrouverait le
   * comportement d'avant ce lot au bit près ; c'est exactement ce que fait
   * `chat()` ci-dessus, qui garde son propre chemin bufferisé pour la route
   * MCP.
   *
   * Budget : le même plafond que `chat()` (`CHAT_CALLER_BUDGET_MS`), porté
   * par un `AbortSignal.timeout` puisque `streamSse` n'a pas de `timeoutMs` —
   * une seule tentative n'a pas de sens à retenter (un flux à moitié consommé
   * ne se rejoue pas). `idleTimeoutMs` borne le silence ENTRE deux octets, pas
   * la durée totale : le service IA émet un commentaire de garde toutes les
   * 15 s (voir `chat.py::_KEEPALIVE_SECONDS`), donc un silence de
   * `CHAT_STREAM_IDLE_TIMEOUT_MS` sans RIEN — pas même un commentaire — est
   * une preuve sans ambiguïté que le producteur a disparu.
   */
  chatStream(
    input: ChatProxyInput,
    opts?: { signal?: AbortSignal; headers?: Record<string, string> } & IaCostOpts,
  ): AsyncGenerator<ChatStreamEvent> {
    const signal = opts?.signal
      ? AbortSignal.any([opts.signal, AbortSignal.timeout(CHAT_CALLER_BUDGET_MS)])
      : AbortSignal.timeout(CHAT_CALLER_BUDGET_MS)
    return this.streamChatEvents({
      urlInfo: { template: '/chat/message' },
      body: this.chatBody(input),
      // #2442.3 — `x-bellum-turn` (ChatTurnClock) : absent = fil d'avant, à l'octet.
      ...(opts?.headers ? { headers: opts.headers } : {}),
      signal,
      idleTimeoutMs: CHAT_STREAM_IDLE_TIMEOUT_MS,
      onResponseHeader: opts?.onResponseHeader,
      responseHeaderName: opts?.responseHeaderName,
    })
  }

  private async *streamChatEvents(args: {
    urlInfo: { template: string }
    body: Record<string, unknown>
    headers?: Record<string, string>
    signal: AbortSignal
    idleTimeoutMs: number
    onResponseHeader?: (name: string, value: string | null) => void
    responseHeaderName?: string
  }): AsyncGenerator<ChatStreamEvent> {
    const stream = this.streamSse<unknown>(args)
    for await (const raw of stream) {
      const parsed = parseChatStreamEvent(raw)
      if (!parsed) {
        // Une frame que ce client ne reconnaît pas (déploiement partiel,
        // service IA plus récent) — sautée, jamais fatale : ce n'est ni un
        // `delta` ni un `step` ni un `done`, donc l'ignorer ne perd aucune
        // information que l'appelant pourrait exploiter. Même politique que
        // `analyzeGraph` pour un `unknown_type`.
        this.logger.warn('Unrecognised chat stream event — skipped')
        continue
      }
      yield parsed
    }
  }

  /** RAG semantic search, scoped to the caller's WORKSPACE (`workspaceId`
   *  resolved server-side from the JWT — never the body). The knowledge base is a
   *  team asset: a rep searches what the whole ESN uploaded, and nothing else. */
  ragQuery(
    input: { userId: string; workspaceId?: string; query: string; topK?: number },
    opts?: IaCallOpts,
  ): Promise<IaEnvelope> {
    return this.request<IaEnvelope>({
      urlInfo: { template: '/rag/query' },
      body: {
        user_id: input.userId,
        workspace_id: input.workspaceId ?? '',
        query: input.query,
        top_k: input.topK ?? 5,
      },
      ...opts,
    })
  }

  /**
   * Extrait le TEXTE d'un fichier de CV (PDF 3 §3.2).
   *
   * Déterministe, aucun appel de modèle : l'extraction ne coûte rien, et le
   * parsing qui vient ensuite est un geste séparé. Un fichier illisible rend un
   * 422 dont le MOTIF voyage — « aucun texte » sans raison enverrait
   * l'utilisateur redéposer le même scan.
   *
   * #2542.M3 — le délai amont couvre le budget de la lecture optique : cet
   * appel peut déclencher l'OCR côté IA (`apps/ia/app/services/ocr.py`,
   * `extract_document_text` → OCR quand le PDF n'a pas de couche de texte),
   * dont le budget PROPRE est `_TIMEOUT_S = 60.0` (`ocr.py:42`). Sans
   * `timeoutMs` explicite, `cvExtract` héritait du défaut `HttpClient` — 30 s
   * — et abandonnait alors que l'OCR travaillait encore légitimement entre
   * 30 s et 60 s : le document restait « en analyse » sans qu'aucune erreur
   * n'explique pourquoi (mesuré par le lot précédent, #2542).
   */
  cvExtract(input: { fileB64: string; filename?: string }, opts?: IaCallOpts): Promise<IaEnvelope> {
    return this.request<IaEnvelope>({
      urlInfo: { template: '/cv/extract' },
      body: { file_b64: input.fileB64, filename: input.filename ?? null },
      // Un délai amont ÉGAL au budget OCR (60 s) est une course perdue
      // d'avance : réseau + sérialisation s'ajoutent toujours par-dessus.
      // Même marge que `CHAT_CALLER_BUDGET_MS` plus haut dans ce fichier
      // (30 s au-dessus du budget aval qu'il couvre) — pas un chiffre choisi
      // au jugé pour ce lot.
      //
      // ⚠️ Les deux dépôts (API TypeScript, IA Python) ne partagent aucune
      // constante : `CV_OCR_TIMEOUT_MS` RECOPIE consciemment `ocr.py:42`. Si
      // le budget OCR change côté Python, cette valeur doit changer avec lui
      // — `cv-extract-timeout.spec.ts` lit les deux nombres et rougit si
      // l'écart entre eux disparaît.
      timeoutMs: CV_OCR_TIMEOUT_MS,
      ...opts,
    })
  }

  /**
   * Lit un CV et rend treize blocs, chacun avec sa citation (PDF 3 §4).
   *
   * Le service IA retire déjà les champs sans citation retrouvable. L'API
   * revalide par-dessus : la règle « pas de champ sans preuve » est trop
   * importante pour ne vivre qu'à un seul endroit.
   */
  cvParse(input: { cvText: string }, opts?: IaCallOpts): Promise<IaEnvelope> {
    return this.request<IaEnvelope>({
      urlInfo: { template: '/cv/parse' },
      body: { cv_text: input.cvText },
      // #2542.2/#2542.3 — mesuré en suivant la chaîne #2542, même défaut que
      // #2123.59 (trouvé la veille, `generateMessage`) : ceci est un appel
      // Claude coûteux (`apps/ia/app/routers/cv.py:parse_cv` → `call_claude`)
      // qui héritait des défauts de `HttpClient` (3 tentatives, 30 s chacune)
      // au lieu du patron déjà tenu par `battlecard` / `rewriteCv` / `needPlay`
      // / `compareAccounts` / `generateMessage` : un seul essai — « retrying
      // triple la dépense sans bénéfice ». `timeoutMs` reprend EXACTEMENT
      // celui de `rewriteCv` juste plus bas (même fichier, même forme de
      // prompt : un CV entier lu, une sortie structurée) — pas un chiffre
      // choisi au jugé pour ce lot.
      maxAttempts: 1,
      timeoutMs: 60_000,
      ...opts,
    })
  }

  /**
   * Dépose un document dans la base de connaissance de l'ESPACE (`userId` et
   * `workspaceId` viennent du JWT, jamais du corps). Accepte du texte brut
   * (`content`) OU un fichier base64 (`fileB64` + `filename`) — le service IA en
   * extrait le texte (PDF via pypdf, Théo p.21). C'est le tampon d'espace qui
   * fait de ce dépôt un ancrage pour l'analyse de chaque collègue.
   *
   * ⚠️ **C'est la porte UNIQUE du magasin** : le dépôt manuel
   * (`RagController.ingest`), une page Notion, un document Drive et un CV y
   * passent tous. La garde d'ingestion vit donc ICI et nulle part ailleurs —
   * la brancher appelant par appelant garantirait d'en oublier un, et le
   * cinquième appelant écrit demain n'aurait rien à respecter. Même arbitrage
   * que le plafond de proactivité, qui vit dans `createNotification` seul.
   *
   * Le refus est PRÉALABLE : aucune requête ne part, donc il n'y a rien à
   * effacer ensuite d'un magasin vectoriel — ce qui est important, parce qu'un
   * document indexé reste retrouvable indéfiniment.
   */
  // `async` et non un `throw` nu : la méthode annonce une promesse, donc elle
  // REJETTE. Un refus synchrone derrière un type `Promise` échappe au `.catch()`
  // d'un appelant qui n'attend pas — et ce refus-là ne doit jamais se perdre.
  async ragIngest(
    input: {
      userId: string
      workspaceId?: string
      title: string
      content?: string
      category?: string
      fileB64?: string
      filename?: string
      /**
       * #1954.7 — la PORTÉE du document (Louis, 12/09/2026). Omise = clé
       * absente du corps envoyé au service IA, donc comportement byte-identique
       * à avant cette décision (le service IA défaut lui-même à `workspace`).
       */
      scope?: RagDocumentScope
      conversationId?: string
      accountId?: string
      /** #2861 (#2437.2, niveau SOURCE) — la langue DÉCLARÉE du document, jamais devinée. */
      language?: MarketLocale
    },
    opts?: IaCallOpts,
  ): Promise<IaEnvelope> {
    const refusal = ragIngestionRefusal({
      // Le manifeste nomme des FICHIERS ; un dépôt manuel n'a parfois que son
      // titre, et c'est là que le nom du fichier atterrit.
      filename: input.filename || input.title,
      sample: input.content?.trim() ? input.content : textHeadFromBase64(input.fileB64),
    })
    if (refusal) throw new BadRequestException(refusal.message)

    return this.request<IaEnvelope>({
      urlInfo: { template: '/rag/ingest' },
      body: {
        user_id: input.userId,
        workspace_id: input.workspaceId ?? '',
        title: input.title,
        content: input.content ?? '',
        category: input.category ?? '',
        file_b64: input.fileB64 ?? null,
        filename: input.filename ?? null,
        // #1954.7 — clés OMISES quand absentes (jamais une valeur par défaut
        // envoyée explicitement) : un appelant qui ne connaît pas encore la
        // portée (tout le reste du produit, aujourd'hui) obtient exactement
        // le corps d'avant, au bit près.
        ...(input.scope ? { scope: input.scope } : {}),
        ...(input.conversationId ? { conversation_id: input.conversationId } : {}),
        // #2779 — le compte visé, seulement quand il est fourni (fil byte-identique sinon).
        ...(input.accountId ? { account_id: input.accountId } : {}),
        // #2861 — omise quand absente : byte-identique pour tout appelant qui
        // ne connaît pas encore la langue source.
        ...(input.language ? { language: input.language } : {}),
      },
      ...opts,
    })
  }

  /**
   * #2148.16 — LA PIÈCE JOINTE DE CONVERSATION (cas a) : extraire le texte
   * d'un fichier SANS l'ingérer — aucune ligne de `rag_documents`, jamais
   * listé dans la base de connaissance. Même refus préalable que `ragIngest`
   * (taille, macro, contenu adverse) : un fichier qui se ferait refuser à
   * l'ingestion ne doit pas être lisible par un chemin qui le contourne.
   */
  async ragExtract(
    input: { fileB64: string; filename?: string; source?: 'internal_drive'; locateObjects?: boolean },
    opts?: IaCallOpts & IaCostOpts,
  ): Promise<IaEnvelope> {
    const refusal = ragIngestionRefusal({
      filename: input.filename || 'fichier',
      sample: textHeadFromBase64(input.fileB64),
    })
    if (refusal) throw new BadRequestException(refusal.message)

    return this.request<IaEnvelope>({
      urlInfo: { template: '/rag/extract' },
      body: {
        file_b64: input.fileB64,
        filename: input.filename ?? null,
        // #3586 — plafond de taille propre à la synchro du Drive interne (25 Mo côté IA) ;
        // omis = pièce jointe d'utilisateur (8 Mo), corps byte-identique.
        ...(input.source ? { source: input.source } : {}),
        // #2433.12 (lot P02 09/10) — le localiseur d'objets d'une image du chat ;
        // omis = corps byte-identique (synchro du Drive, PDF, salle de démo).
        ...(input.locateObjects ? { locate_objects: true } : {}),
      },
      ...opts,
    })
  }

  /**
   * La purge mensuelle du magasin de connaissance (tome 7 §38, M3).
   *
   * L'API possède l'infrastructure de cron et le verrou multi-replica ; le
   * service IA possède la table. Le geste destructeur reste donc chez son
   * propriétaire, et l'ordonnancement chez le sien.
   */
  ragPurge(input: { dryRun?: boolean } = {}, opts?: IaCallOpts): Promise<IaEnvelope> {
    return this.request<IaEnvelope>({
      urlInfo: { template: `/rag/purge?dry_run=${input.dryRun ? 'true' : 'false'}` },
      body: {},
      ...opts,
    })
  }

  /**
   * #3750.4 — découpe en morceaux un petit lot de documents RAG longs qui n'en ont pas encore (rattrapage
   * nocturne, `RagChunkBackfillScheduler`). Idempotent côté IA : un document découpé n'est plus rendu.
   */
  ragChunkBackfill(input: { batchSize: number }, opts?: IaCallOpts): Promise<IaEnvelope> {
    return this.request<IaEnvelope>({
      urlInfo: { template: `/rag/chunks/backfill?batch_size=${Math.max(1, Math.trunc(input.batchSize))}` },
      body: {},
      ...opts,
    })
  }

  /**
   * #3586 — calcule les embeddings des chunks du corpus partagé `dataforge_rag_chunks` qui n'en ont pas
   * encore (ceux que la synchro du Drive interne vient d'insérer). Sans `EMBEDDING_API_KEY` côté IA, le
   * service répond « rien à calculer » : no-op strict.
   */
  dataforgeBackfillEmbeddings(opts?: IaCallOpts & { maxSeconds?: number }): Promise<IaEnvelope> {
    const { maxSeconds, ...callOpts } = opts ?? {}
    return this.request<IaEnvelope>({
      urlInfo: { template: '/rag/dataforge/backfill-embeddings' },
      // #3586 — `max_seconds` borne un passage côté IA (qui répond `done` / `remaining`) ; le délai HTTP
      // lui laisse 30 s de marge, sinon le client coupait l'appel après 30 s et le rattrapage s'arrêtait là.
      body: { batch_size: 100, ...(maxSeconds ? { max_seconds: maxSeconds } : {}) },
      ...(maxSeconds ? { timeoutMs: (maxSeconds + 30) * 1000, maxAttempts: 1 } : {}),
      ...callOpts,
    })
  }

  /**
   * #3586 (W2) — fait produire au service IA le digest du Drive interne (UN appel Claude sur les chunks
   * `DRIVE_INTERNE` vivants). Rend `{ digest: string | null, source_chunks, input_chars }` ; c'est l'API qui
   * le stocke. Une seule tentative : la synchro suivante (10 min) retente d'elle-même.
   */
  internalKnowledgeDigest(opts?: IaCallOpts): Promise<IaEnvelope> {
    return this.request<IaEnvelope>({
      urlInfo: { template: '/rag/internal-knowledge/digest' },
      body: {},
      timeoutMs: 180_000,
      maxAttempts: 1,
      ...opts,
    })
  }

  /**
   * Transforme des notes de rendez-vous en compte rendu structuré.
   *
   * Aucun identifiant n'est transmis : la seule source du compte rendu est le
   * texte envoyé. C'est ce qui permet à la même route de servir des notes tapées
   * comme une transcription — et ce qui garantit que rien d'autre ne se glisse
   * dans un document qui va circuler.
   */
  structureMeetingNotes(
    input: {
      notes: string
      accountName?: string
      attendees?: string
      fromTranscript?: boolean
      /** #2319.61-.62 — la nature du texte principal. */
      inputKind?: MeetingNotesInputKind
      /** #2319.63 — la déclaration de l'utilisateur, à part. */
      userStatement?: string
    },
    opts?: IaCallOpts,
  ): Promise<IaEnvelope> {
    return this.request<IaEnvelope>({
      urlInfo: { template: '/notes/structure' },
      body: {
        notes: input.notes,
        account_name: input.accountName ?? '',
        attendees: input.attendees ?? '',
        // La nature du texte décide si un extrait CITABLE existe : sur des
        // notes résumées, exiger une citation revient à en faire fabriquer une.
        from_transcript: input.fromTranscript ?? false,
        input_kind: input.inputKind ?? (input.fromTranscript ? 'transcript' : 'notes'),
        user_statement: input.userStatement ?? '',
      },
      ...opts,
    })
  }

  /**
   * Met en lignes un organigramme décrit en toutes lettres (#1103), ou déposé
   * en fichier — PDF, classeur Excel (.xlsx) ou présentation (.pptx) (#3740,
   * reste). Les deux entrées sont exclusives : `text` OU `file`.
   *
   * Aucun identifiant transmis, comme pour le compte rendu de rendez-vous : la
   * seule source est le texte envoyé (tapé, ou extrait du fichier CÔTÉ IA,
   * `document_text.py` — jamais recalculé ici, GA-26). C'est ce qui rend la
   * garde anti-invention VÉRIFIABLE côté appelant — chaque nom rendu doit se
   * retrouver dans CE texte, et nulle part ailleurs : `envelope.data
   * .resolvedText` est TOUJOURS la valeur à garder pour cette garde, jamais le
   * `text` envoyé ici, qui est absent pour un fichier.
   */
  declareOrgFromText(
    input: {
      accountName?: string
      text?: string
      file?: { base64: string; name?: string }
    },
    opts?: IaCallOpts,
  ): Promise<IaEnvelope> {
    return this.request<IaEnvelope>({
      urlInfo: { template: '/org/declare-from-text' },
      body: {
        account_name: input.accountName ?? '',
        ...(input.text !== undefined ? { text: input.text } : {}),
        ...(input.file ? { file_base64: input.file.base64, file_name: input.file.name } : {}),
      },
      ...opts,
    })
  }

  /**
   * #4072.1 — les personnes ÉCRITES dans les organigrammes présents dans les
   * documents de l'espace. Aucun modèle côté IA : extraction bornée, lecture
   * seule, portée du demandeur (équipe + documents de CE compte).
   */
  orgDocumentPeople(
    input: { userId: string; workspaceId?: string | null; accountId?: string },
    opts?: IaCallOpts,
  ): Promise<IaEnvelope> {
    return this.request<IaEnvelope>({
      urlInfo: { template: '/org/document-people' },
      body: {
        user_id: input.userId,
        ...(input.workspaceId ? { workspace_id: input.workspaceId } : {}),
        ...(input.accountId ? { account_id: input.accountId } : {}),
      },
      ...opts,
    })
  }

  /**
   * Des sujets de publication ancrés dans ce que l'ESN fait réellement.
   *
   * On demande des SUJETS et non des posts : ce qui est publié sous le nom d'un
   * commercial engage sa crédibilité auprès de gens qui le connaissent, et un
   * texte entièrement généré se reconnaît.
   */
  postIdeas(
    input: { esnOffers?: string; missions?: string; signals?: string; objective?: string },
    opts?: IaCallOpts,
  ): Promise<IaEnvelope> {
    return this.request<IaEnvelope>({
      urlInfo: { template: '/content/post-ideas' },
      body: {
        esn_offers: input.esnOffers ?? '',
        missions: input.missions ?? '',
        signals: input.signals ?? '',
        objective: input.objective ?? '',
      },
      ...opts,
    })
  }

  /**
   * Analyse un appel d'offres (addendum final p66-68) : exigences classées +
   * bid/no-bid argumenté.
   *
   * `requirements` et `decision` restent `unknown` ici À DESSEIN : c'est le
   * service appelant qui les passe au schéma zod partagé. Les typer ici les
   * ferait valider deux fois — et la version du client finirait par diverger.
   *
   * Le texte peut arriver déjà extrait, ou en fichier brut — l'IA lit alors le
   * PDF, le Word ou le classeur côté serveur, pour la même raison que
   * l'ingestion RAG : lire un `.docx` en UTF-8 côté navigateur produit du
   * mojibake.
   */
  async rfpAnalyse(
    input: {
      text?: string
      fileBase64?: string
      fileName?: string
      profileData: Record<string, unknown>
      accountName?: string
    },
    opts?: IaCallOpts,
  ): Promise<RfpAnalyseData> {
    const envelope = await this.request<{ success: boolean; data: RfpAnalyseData }>({
      urlInfo: { template: '/rfp/analyse' },
      body: {
        text: input.text ?? null,
        file_base64: input.fileBase64 ?? null,
        file_name: input.fileName ?? null,
        profile_data: input.profileData,
        account_name: input.accountName ?? null,
      },
      ...opts,
    })
    return envelope.data ?? {}
  }

  /**
   * Rédige la réponse à UNE exigence, à partir de sources approuvées.
   *
   * Une exigence par appel, délibérément : rédiger quarante réponses d'un coup
   * rend impossible de dire laquelle repose sur quelle source.
   */
  async rfpDraft(
    input: { requirement: unknown; approvedSources: { title: string; content: string }[]; clientFormat?: string },
    opts?: IaCallOpts,
  ): Promise<RfpDraftData> {
    const envelope = await this.request<{ success: boolean; data: RfpDraftData }>({
      urlInfo: { template: '/rfp/draft' },
      body: {
        requirement: input.requirement,
        approved_sources: input.approvedSources,
        client_format: input.clientFormat ?? null,
      },
      ...opts,
    })
    return envelope.data ?? {}
  }

  /**
   * Recalcule les cinq axes du score sur une analyse (P1-10). Déterministe :
   * aucun modèle, aucun crédit.
   *
   * Appelée après une correction utilisateur — un contact signalé faux, un
   * signal marqué obsolète — pour que la note suive la donnée corrigée sans
   * rejouer le dossier. Le calcul reste côté IA parce que c'est là que le
   * pipeline le produit : le réécrire ici donnerait deux implémentations de la
   * même règle, et un score qui change tout seul entre deux lectures.
   */
  async scoreAxes(
    input: { analysis: Record<string, unknown>; profile?: Record<string, unknown> },
    opts?: IaCallOpts,
  ): Promise<ScoreAxesData> {
    const envelope = await this.request<{ success: boolean; data: ScoreAxesData }>({
      urlInfo: { template: '/score/axes' },
      body: { analysis: input.analysis, profile: input.profile ?? {} },
      ...opts,
    })
    return envelope.data ?? { axes: [], total: 0, max: 25, limitedByData: [] }
  }

  /**
   * #2298.4 (19/09/2026, lot I3) — recalcule l'AXE RELATION seul, gratuitement
   * (P1-10-like : déterministe, aucun modèle, aucun crédit — mêmes garanties
   * que {@link scoreAxes} juste au-dessus).
   *
   * ⚠️ AUCUN paramètre `crmPresence` — et ce n'est pas un oubli. Le lire
   * exigerait un appel LIVE au fournisseur CRM connecté (`CrmReadService`,
   * HubSpot/Salesforce), donc un appel sortant : exactement ce que ce chemin
   * gratuit refuse. L'appelant (`AnalysisOnDemandService.recalculateRelationAxis`)
   * ne DOWNGRADE jamais un axe déjà mesuré par un calcul CRM antérieur — cette
   * garde vit côté appelant, jamais ici.
   */
  async recalculateRelationAxis(
    input: {
      missionsCount?: number
      lastMeetingAt?: string
      lastEmailAt?: string
      /** #4680 — contacts CONNUS (import / CRM) rattachés au compte : un nombre lu en base, jamais un nom. */
      knownContactsCount?: number
      humanCorrection?: string
    },
    opts?: IaCallOpts,
  ): Promise<RelationAxisRecalcData> {
    const envelope = await this.request<{ success: boolean; data: RelationAxisRecalcData }>({
      urlInfo: { template: '/score/addressability-relation' },
      body: {
        missions_count: input.missionsCount ?? null,
        last_meeting_at: input.lastMeetingAt ?? null,
        last_email_at: input.lastEmailAt ?? null,
        known_contacts_count: input.knownContactsCount ?? null,
        human_correction: input.humanCorrection ?? null,
      },
      ...opts,
    })
    return envelope.data ?? { score: null, max: 0, unmeasured: ['relation'], factors: [] }
  }

  /** « Vérifier une relation » (annexe organigramme p22) — recherche web CIBLÉE
   *  sur UN lien entre deux personnes nommées. Réponse déterministe (aucun LLM
   *  ne prononce de hiérarchie) : `{verified, confidence, sources[]}`, avec
   *  `confidence: null` quand rien n'a été trouvé — l'appelant laisse alors le
   *  lien inchangé. Sans clé de recherche, zéro appel réseau et « rien trouvé ». */
  verifyRelation(
    input: { company: string; fromName: string; toName: string; website?: string | null },
    opts?: IaCallOpts,
  ): Promise<IaEnvelope> {
    return this.request<IaEnvelope>({
      urlInfo: { template: '/org/verify-relation' },
      body: {
        company: input.company,
        from_name: input.fromName,
        to_name: input.toName,
        website: input.website ?? null,
      },
      ...opts,
    })
  }

  /**
   * Louis 30/10 — les offres d'un compte pour un métier saisi sur sa fiche (`POST /companies/job-offers`),
   * au plus 50. `searched: false` = la source n'a pas été interrogée, jamais « aucune offre ».
   */
  async accountJobOffers(input: {
    company: string
    term: string
    website: string | null
    siren: string | null
  }): Promise<{ offers: unknown[]; searched: boolean }> {
    const res = await this.request<{ offers?: unknown; searched?: unknown }>({
      urlInfo: { template: '/companies/job-offers' },
      body: input,
      // Le commercial attend la réponse sur la fiche.
      interactive: true,
      timeoutMs: 30_000,
      maxAttempts: 1,
    })
    return { offers: Array.isArray(res?.offers) ? res.offers : [], searched: res?.searched === true }
  }

  /**
   * #1911.1 — le titre court d'un fil de Laura (`POST /chat/title`), rédigé par
   * le modèle léger du service IA.
   *
   * `null` quand aucun titre ne tient : pas de clé de modèle côté IA, ou un
   * titre REFUSÉ (éditeur nommé, nom propre absent du fil). L'appelant garde
   * alors le premier message — jamais un titre deviné ici.
   */
  async chatThreadTitle(
    input: { messages: { role: 'user' | 'assistant'; content: string }[]; locale: 'fr' | 'en' },
    // `IaCostOpts` : l'appelant lit `x-bellum-costs` pour enregistrer le coût réel.
    opts?: IaCallOpts & IaCostOpts,
  ): Promise<string | null> {
    const envelope = await this.request<{ success: boolean; data?: { title?: unknown } }>({
      urlInfo: { template: '/chat/title' },
      body: { messages: input.messages, locale: input.locale },
      ...opts,
    })
    const title = envelope?.data?.title
    return typeof title === 'string' ? title : null
  }

  /**
   * #3223 (décision Louis 11/10/2026) — fait juger un échantillon de réponses de
   * Laura par le juge « recommandation générique »
   * (`POST /eval/generic-recommendation-judge`).
   *
   * `disabled` : `CHAT_PROD_SAMPLING_ENABLED` éteint côté IA (aucun appel au
   * modèle) ; `unavailable` : pas de clé de modèle. Un verdict hors des trois
   * jetons, ou `null`, revient `null` — jamais un verdict deviné.
   */
  async judgeGenericRecommendations(
    answers: ReadonlyArray<{ id: string; text: string }>,
    opts?: IaCallOpts,
  ): Promise<
    | { status: 'disabled' | 'unavailable' }
    | { status: 'judged'; judgeVersion: string; verdicts: Array<{ id: string; verdict: GenericJudgeVerdict | null }> }
  > {
    const envelope = await this.request<{
      success: boolean
      data?: { status?: unknown; judgeVersion?: unknown; verdicts?: unknown }
    }>({
      urlInfo: { template: '/eval/generic-recommendation-judge' },
      body: { answers },
      ...opts,
    })
    const data = envelope?.data
    if (data?.status !== 'judged' || typeof data.judgeVersion !== 'string' || !Array.isArray(data.verdicts)) {
      return { status: data?.status === 'disabled' ? 'disabled' : 'unavailable' }
    }
    const verdicts = (data.verdicts as Array<{ id?: unknown; verdict?: unknown }>).flatMap(row =>
      typeof row?.id === 'string'
        ? [
            {
              id: row.id,
              verdict: (GENERIC_JUDGE_VERDICTS as readonly unknown[]).includes(row.verdict)
                ? (row.verdict as GenericJudgeVerdict)
                : null,
            },
          ]
        : [],
    )
    return { status: 'judged', judgeVersion: data.judgeVersion, verdicts }
  }

  /**
   * #2810 — extraire un nom d'entreprise d'une phrase en langage naturel
   * (`POST /search/extract-entity`), pour préremplir `/search`.
   *
   * `null` quand rien ne tient : pas de clé de modèle côté IA, ou un nom
   * REFUSÉ (pas recopié mot pour mot de la phrase tapée — ancrage côté IA).
   * L'appelant garde alors la phrase tapée telle quelle — jamais un nom
   * deviné ici, même chemin que `chatThreadTitle` juste au-dessus.
   */
  async extractSearchEntity(input: { text: string; locale?: 'fr' | 'en' }, opts?: IaCallOpts): Promise<string | null> {
    const envelope = await this.request<{ success: boolean; data?: { company?: unknown } }>({
      urlInfo: { template: '/search/extract-entity' },
      body: { text: input.text, locale: input.locale ?? 'fr' },
      ...opts,
    })
    const company = envelope?.data?.company
    return typeof company === 'string' ? company : null
  }

  /** Generate personalised icebreakers for a contact. `userId` from the JWT —
   *  the IA endpoint checks the contact is owned by that user. */
  icebreaker(
    input: { userId: string; contactId: string; profileData?: Record<string, unknown> },
    opts?: IaCallOpts,
  ): Promise<IaEnvelope> {
    return this.request<IaEnvelope>({
      urlInfo: { template: '/icebreaker/generate' },
      // profile_data is the ESN seller profile resolved server-side (same source as
      // discover/chat) so the messages carry the real ESN name/offers, not "votre ESN".
      body: { user_id: input.userId, contact_id: input.contactId, profile_data: input.profileData },
      ...opts,
    })
  }

  /**
   * Generate one ready-to-send outreach draft for a contact on a channel
   * (engagement composer). `userId` from the JWT — ownership checked server-side.
   *
   * #2123.59 — un seul essai, comme `battlecard` / `rewriteCv` / `needPlay` /
   * `compareAccounts` juste au-dessus : un appel Claude coûteux ne se retente
   * pas tout seul (retrying triple la dépense sans bénéfice), et le composer
   * propose déjà un retry explicite (P0-05) sur l'entrée d'erreur du fil.
   * Timeout étendu : le prompt porte désormais le CADRAGE (#1926) et les sept
   * paramètres du formulaire (#2123.61-.68), plus long que le défaut de
   * `HttpClient` (30 s) — mesuré en production le 17/09 : le composer échouait
   * après un délai perceptible, exactement le motif que ces deux réglages
   * évitent déjà pour les autres brouillons IA de ce fichier.
   */
  generateMessage(
    input: {
      userId: string
      contactId: string
      channel: string
      context?: string
      /** #2123.61-.68 — les paramètres choisis dans le formulaire du composer. */
      parameters?: Record<string, string | undefined>
      /** #3419.3 — réécrire l'ouverture d'un message déjà rédigé (« Autres accroches »). */
      revision?: { kind: 'alternative_hook'; currentBody: string; previousHooks?: string[] }
      /** #4524.2 — « Sur quoi Laura s'appuie » : les faits cochés, ou « angle libre ». */
      grounding?: MessageGrounding
      profileData?: Record<string, unknown>
    },
    opts?: IaCallOpts & IaCostOpts,
  ): Promise<IaEnvelope> {
    return this.request<IaEnvelope>({
      urlInfo: { template: '/message/generate' },
      body: {
        user_id: input.userId,
        contact_id: input.contactId,
        channel: input.channel,
        context: input.context ?? null,
        ...(input.parameters ? { parameters: input.parameters } : {}),
        ...(input.revision
          ? {
              revision: {
                kind: input.revision.kind,
                current_body: input.revision.currentBody,
                previous_hooks: input.revision.previousHooks ?? [],
              },
            }
          : {}),
        ...(input.grounding ? { grounding: input.grounding } : {}),
        profile_data: input.profileData,
      },
      maxAttempts: 1,
      timeoutMs: 60_000,
      ...opts,
    })
  }

  /**
   * #4347 — Laura rédige le message à un CONSULTANT du vivier (`POST /talent/message-draft`).
   * Un seul essai (un appel modèle ne se retente pas tout seul : la fenêtre propose « Régénérer »),
   * et l'échec VOYAGE (`TechnicalError`) : l'appelant le nomme, il n'invente jamais de texte.
   */
  talentMessageDraft(
    input: {
      userId: string
      channel: string
      consultant: Record<string, unknown>
      need?: Record<string, unknown>
      /** #4347.2 — toujours « tu » : Bellum et Laura tutoient ; l'IA ne lit plus le registre (défense en profondeur). */
      formality?: 'tu'
      variant?: string
      previousBody?: string
    },
    opts?: IaCallOpts & IaCostOpts,
  ): Promise<IaEnvelope> {
    return this.request<IaEnvelope>({
      urlInfo: { template: '/talent/message-draft' },
      body: {
        user_id: input.userId,
        channel: input.channel,
        consultant: input.consultant,
        ...(input.need ? { need: input.need } : {}),
        ...(input.formality ? { formality: input.formality } : {}),
        ...(input.variant ? { variant: input.variant } : {}),
        ...(input.previousBody ? { previous_body: input.previousBody } : {}),
      },
      maxAttempts: 1,
      timeoutMs: 60_000,
      ...opts,
    })
  }

  /** On-demand "briefing du lundi matin" (BELLUM-WEEKLY): the IA aggregates the
   *  caller's accounts, open plan actions and weekly activity into a synthesised
   *  top-5 / focus-account / tip briefing. `userId` from the JWT; `profileData`
   *  is the ESN seller profile resolved server-side so the briefing personalises
   *  like the dossier does. Present-only — the IA never invents accounts/signals. */
  weeklyBriefing(
    input: { userId: string; profileData: Record<string, unknown> },
    opts?: IaCallOpts,
  ): Promise<IaEnvelope> {
    return this.request<IaEnvelope>({
      urlInfo: { template: '/weekly/briefing' },
      body: { user_id: input.userId, profile_data: input.profileData },
      ...opts,
    })
  }

  /** Competitive battle card for a meeting on one account (present-only: nous vs
   *  the ESN already identified on the account). `userId` from the JWT — the IA
   *  fetches the account scoped to that user (404 otherwise). Single attempt:
   *  one Claude call, retrying triples the spend for no benefit. */
  battlecard(
    input: { userId: string; accountId: string; profileData?: Record<string, unknown> },
    opts?: IaCallOpts,
  ): Promise<IaEnvelope> {
    return this.request<IaEnvelope>({
      urlInfo: { template: '/battlecard/generate' },
      body: { user_id: input.userId, account_id: input.accountId, profile_data: input.profileData },
      maxAttempts: 1,
      timeoutMs: 45_000,
      ...opts,
    })
  }

  /**
   * Réécrit le CV d'un consultant pour un besoin (annexe méthodo p22).
   *
   * Le consultant et la mission sont envoyés TELS QUELS : le vivier appartient à
   * NestJS, qui l'a déjà scopé au workspace de l'appelant — l'IA n'a aucune
   * lecture à faire, donc aucune fuite possible entre équipes par cette route.
   *
   * Un seul essai : la réécriture est un appel Claude coûteux, et un échec se
   * rejoue au clic. La sortie est brute — c'est `cv-rewrite-guard.ts` qui
   * confronte chaque citation au CV source avant que ça n'atteigne un écran.
   */
  rewriteCv(
    input: { consultant: Record<string, unknown>; mission: Record<string, unknown> },
    opts?: IaCallOpts,
  ): Promise<IaEnvelope> {
    return this.request<IaEnvelope>({
      urlInfo: { template: '/cv/rewrite' },
      body: { consultant: input.consultant, mission: input.mission },
      maxAttempts: 1,
      timeoutMs: 60_000,
      ...opts,
    })
  }

  /**
   * Prépare l'attaque d'UN besoin (D9 option A — ce que le crédit achète).
   *
   * Le besoin, le dossier et le profil ESN partent TELS QUELS : NestJS les a
   * déjà scopés au workspace de l'appelant, l'IA ne lit rien en base. La sortie
   * est brute — c'est `need-play-guard.ts` qui confronte chaque citation à la
   * matière source avant qu'elle n'atteigne un écran.
   *
   * Un seul essai : c'est un appel Claude coûteux et un échec se rejoue au clic
   * (sans débit, puisque rien n'a été produit).
   */
  needPlay(
    input: {
      need: Record<string, unknown>
      account: Record<string, unknown>
      profile?: Record<string, unknown> | null
      contacts?: Record<string, unknown>[]
    },
    opts?: IaCallOpts & IaCostOpts,
  ): Promise<IaEnvelope> {
    return this.request<IaEnvelope>({
      urlInfo: { template: '/needs/play' },
      body: {
        need: input.need,
        account: input.account,
        profile: input.profile ?? null,
        contacts: input.contacts ?? [],
      },
      maxAttempts: 1,
      timeoutMs: 60_000,
      ...opts,
    })
  }

  /**
   * Génère la synthèse en 7 questions d'une opportunité (#2171.27).
   *
   * L'opportunité, le compte et les contacts liés partent TELS QUELS : NestJS
   * les a déjà scopés au workspace de l'appelant (`ProjectSynthesisService`),
   * l'IA ne lit rien en base. Même geste que `needPlay` juste au-dessus — un
   * seul essai, un appel coûteux ne se retente pas tout seul.
   */
  projectSynthesis(
    input: {
      project: Record<string, unknown>
      account: Record<string, unknown>
      contacts?: Record<string, unknown>[]
    },
    opts?: IaCallOpts & IaCostOpts,
  ): Promise<IaEnvelope> {
    return this.request<IaEnvelope>({
      urlInfo: { template: '/project-synthesis/generate' },
      body: {
        project: input.project,
        account: input.account,
        contacts: input.contacts ?? [],
      },
      maxAttempts: 1,
      timeoutMs: 60_000,
      ...opts,
    })
  }

  /** Compare & prioritise several owned accounts (LLM prioritisation). `userId`
   *  from the JWT — the IA scopes the `.in_(ids)` read to that user, so a client
   *  can never pull another tenant's rows. Single attempt / longer deadline. */
  compareAccounts(
    input: { userId: string; accountIds: string[]; profileData?: Record<string, unknown> },
    opts?: IaCallOpts,
  ): Promise<IaEnvelope> {
    return this.request<IaEnvelope>({
      urlInfo: { template: '/compare/' },
      body: { user_id: input.userId, account_ids: input.accountIds, profile_data: input.profileData },
      maxAttempts: 1,
      timeoutMs: 45_000,
      ...opts,
    })
  }
}

/** Generic `{ success, data }` envelope the browser-facing IA routers return. */
/** Réponse de `/rfp/analyse` — la forme lue par `RfpService`. */
type RfpAnalyseData = {
  title?: string
  issuer?: string | null
  dueAt?: string | null
  /** #2957 (#2180.39) — la référence de la consultation, telle qu'écrite. */
  reference?: string | null
  lots?: string[]
  requirements?: unknown
  decision?: unknown
  sourceText?: string | null
  // #2957 — la structure DOSSIER (douze catégories). Non typé finement ici,
  // comme `requirements`/`decision` : c'est le service appelant qui la passe
  // au schéma zod partagé, pour ne jamais la valider deux fois.
  documentExtraction?: unknown
}

/** Réponse de `/rfp/draft` — une exigence rédigée, avec sa source. */
type RfpDraftData = {
  status?: string
  answer?: string | null
  source?: string | null
  ownerRole?: string
  missing?: string
}

/** Les cinq axes recalculés — forme rendue par `/score/axes`. */
type ScoreAxesData = {
  axes: { axis: string; points: number; evidence: string; lever: string | null; limitedByData?: boolean }[]
  total: number
  max: number
  limitedByData: string[]
}

/**
 * #2298.4 (19/09/2026, lot I3) — l'axe relation seul, recalculé — forme
 * rendue par `/score/addressability-relation`. MÊME shape qu'un facteur
 * `Addressability` (`@bellum/contracts`) réduite à l'axe relation :
 * `unmeasured` ne peut contenir que `['relation']` ou `[]`.
 */
type RelationAxisRecalcData = {
  score: number | null
  max: number
  unmeasured: string[]
  factors: { axis: string; label: string; points: number; evidence: string; label_key?: string }[]
}

export type IaEnvelope = { success: boolean; data: Record<string, unknown> }

/**
 * LOT STREAM (12/09/2026) — un événement de `/chat/message` diffusé.
 *
 * Local à ce module (pas `@bellum/contracts`) : trois variantes triviales,
 * un seul consommateur (`IaProxyController`) — le coût d'un schéma partagé
 * ne se justifie pas ici comme il se justifie pour `GraphEvent` (plusieurs
 * services, sept variantes, un historique de désaccord sur la forme).
 */
export type ChatStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'step'; label: string }
  | { type: 'done'; success: boolean; data: Record<string, unknown> }

/** Une frame brute, validée en forme minimale — jamais une frame qui ne
 *  matche aucune des trois variantes connues (voir `streamChatEvents`). */
function parseChatStreamEvent(raw: unknown): ChatStreamEvent | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  if (obj['type'] === 'delta' && typeof obj['text'] === 'string') {
    return { type: 'delta', text: obj['text'] }
  }
  if (obj['type'] === 'step' && typeof obj['label'] === 'string') {
    return { type: 'step', label: obj['label'] }
  }
  if (obj['type'] === 'done' && typeof obj['success'] === 'boolean') {
    const data = obj['data']
    return {
      type: 'done',
      success: obj['success'],
      data: data && typeof data === 'object' ? (data as Record<string, unknown>) : {},
    }
  }
  return null
}

/** Response of the IA `GET /config/integrations` internal status endpoint: a map
 *  of provider id → whether its key(s) are configured on the IA service. Booleans
 *  only — the endpoint never echoes a key value. File-local (consumed structurally
 *  by callers via the method's inferred return type). */
type IaIntegrationStatus = { providers: Record<string, boolean> }

/** #2445.2 (épopée #2766) — one row of the IA `GET /config/model-routing`
 *  response: the EFFECTIVE destination of one canonical task right now. */
export type IaModelRoutingEntry = {
  task: string
  provider: string
  model: string | null
  overridden: boolean
  inheritsFrom: string | null
  /** #2440.82 — la destination est la référence, évaluée, ou À ÉVALUER. */
  evalStatus: 'reference' | 'evaluated' | 'to_evaluate'
  evalReplayCommand: string | null
}
type IaModelRoutingPolicy = { routes: IaModelRoutingEntry[] }

/** #2445.1 (épopée #2766) — one row of the IA `GET /config/prompt-registry`
 *  response: a registered prompt's name and its current template version. */
export type IaPromptRegistryEntry = {
  name: string
  version: string | null
}
type IaPromptRegistry = { prompts: IaPromptRegistryEntry[] }

/** #2445.1 (épopée #2766) — the IA `GET /config/prompt-registry/:name/diff`
 *  response: the git diff text and the (never-executed) rollback command. */
export type IaPromptRegistryDiff = { diff: string; rollbackCommand: string[] }

/** #2445.4 (épopée #2766) — one row of the IA `GET /config/rights-matrix`
 *  response: the permission an outil requires, derived from the SAME
 *  classification the copilot's security eval suite verifies. */
export type IaRightsMatrixEntry = { tool: string; permission: string }
type IaRightsMatrix = { tools: IaRightsMatrixEntry[] }

/** #3274.5 (épopée #3274) — the IA `GET /config/method-corpus-governance`
 *  response: the rule ids `method_corpus_governance.is_rule_active` actually
 *  consults at retrieval — the SalesConnect 162 and the two BEL-SC-233
 *  entries are never in this list (no Python chunk carries them). */
type IaMethodCorpusGovernance = { wiredRuleIds: string[] }

/** Chat proxy inputs. `userId` is always derived from the JWT by the controller. */
type ChatProxyInput = {
  userId: string
  /** Portée équipe du grounding RAG — le copilote cite les documents de l'équipe. */
  workspaceId?: string
  message: string
  /**
   * Documents joints à la conversation (identifiants `rag_documents`).
   *
   * Le composeur du copilote proposait de joindre un fichier ; le fichier
   * partait bien dans la base de connaissance, mais rien ne le rattachait au
   * message, et le copilote répondait — sans mentir — « je n'ai reçu aucun
   * fichier ». Ces identifiants sont ce rattachement.
   */
  documentIds?: string[] | null
  /**
   * #2148.16 — la pièce jointe de CONVERSATION (cas a) : du texte déjà
   * extrait (`POST /rag-documents/extract`), jamais une ligne de
   * `rag_documents`. Lue par le service IA pour CE tour, nulle part écrite.
   */
  attachedFiles?: { name: string; text: string }[] | null
  // The SPA sends `null` for these when no account is active; chat() coalesces
  // null | undefined to IA defaults, so the input type tolerates both.
  accountId?: string | null
  history?: Array<Record<string, unknown>> | null
  accountData?: Record<string, unknown> | null
  contactsSummary?: string | null
  planSummary?: string | null
  // Portfolio digest injected when no single account is active (Théo §13).
  accountsSummary?: string | null
  profileData?: Record<string, unknown> | null
  // Long memory (Théo P2), resolved server-side by the chat-context service.
  // #1962.8 — chaque élément porte sa nature ET son origine (pas seulement le
  // texte du fait) : le prompt en a besoin pour ne jamais laisser une note de
  // Laura jamais confirmée peser comme une correction humaine.
  pinnedFacts?: PinnedMemoryContextItem[] | null
  userPreferences?: Record<string, unknown> | null
  conversationSummary?: string | null
  // Mémoire de corrections du compte (feedback loop A2) — directives factuelles
  // condensées depuis les retours utilisateur, résolues server-side.
  accountFeedback?: string | null
  // #3272.6 — REX de perte(s) déjà connu(s) sur ce compte, condensés
  // server-side (jamais le REX mot pour mot). Vide = bloc non injecté.
  lostDealRexContext?: string | null
  // #3390.10/.11 — la méthode commerciale retenue du besoin ouvert, rendue server-side.
  commercialMethodContext?: string | null
  // #4071.1 — les faits du compte (socle #4069), datés, bornés, sans provenance.
  accountFactsContext?: string | null
  // #3295 — règles apprises de l'espace, condensées server-side. Vide = non injecté.
  workspaceLearnedRulesContext?: string | null
  workspaceRecallContext?: string | null
  // Real integration state resolved server-side (crm_connections) for chat
  // transparency. Null/undefined coalesce to "not connected".
  crmConnected?: boolean | null
  crmProvider?: string | null
  // CRM presence digest for the active account (read-back) — empty/null when the
  // CRM wasn't crossed for this reply.
  crmPresence?: string | null
  // #1915.11 — the read was ATTEMPTED and FAILED (network/provider error),
  // never confused with "nothing found". Null/undefined = not unavailable.
  crmUnavailable?: boolean | null
  // Connected-tools digest (Tool Registry v2): real connections + action costs,
  // resolved server-side. Empty/null = no tools block in the advisor prompt.
  toolsSummary?: string | null
  // #2261.21-32 — digest des HUIT capacités INTERNES (comptes, contacts,
  // besoins, vivier, missions, mémoire marché, DataForge, routines). Même
  // registre que `toolsSummary` (GA-26). Empty/null = no block in the prompt.
  internalCapabilitiesSummary?: string | null
  /** Le prénom de la personne, pour la voix de Laura. */
  chatFirstName?: string | null
  /** #2259.11 — le nom de famille, résolu server-side (`profiles.last_name`). */
  lastName?: string | null
  /** #2259.4 / #2259.13 — le rôle d'espace (RBAC), seul signal réel de
   *  « fonction commerciale » : aucun champ distinct n'existe. */
  workspaceRole?: string | null
  /** #2259.4 — vrai quand cette personne est la propriétaire du compte Bellum
   *  (`role === 'owner'`). Ne dit pas qu'elle dirige l'ESN (#2259.5). */
  isAccountOwner?: boolean | null
  /** #2259.6 — un collègue de l'espace cité par son prénom dans le message. */
  mentionedColleague?: string | null
  /**
   * #2259.30 / #2259.32 / #2259.33 / #2259.34 / #2259.35 — la ou les BU que
   * la personne PORTE, avec ce que l'espace en sait (DÉCISION Louis 17/09
   * après-midi). Contexte pour Laura, jamais un filtre. Absent/vide =
   * propriétaire sans BU (`perimetersOf` rend `[]`) : aucune ligne.
   */
  businessUnits?: BusinessUnitContextItem[] | null
  /**
   * L'écran ouvert, rendu en texte par le contrôleur depuis la déclaration de
   * l'app web. Vide / absent = aucun bloc côté service IA, prompt inchangé.
   */
  pageContext?: string | null
  /** Familles d'outils opérationnelles. `undefined` = « on ne sait pas ». */
  connectedFamilies?: string[] | null
  /** Une précision a-t-elle déjà été demandée dans ce fil ? */
  clarificationAsked?: boolean | null
  /**
   * #1960.20 — l'espace est en marque blanche (`resolveBrand().isCustom`, lu
   * côté serveur). Vrai = aucune adresse Bellum dans le prompt de Laura.
   */
  whiteLabel?: boolean | null
  /**
   * #1958.8 — la langue de l'INTERFACE, déclarée par le navigateur (comme
   * `pageContext` / `clarificationAsked` ci-dessus — jamais résolue
   * server-side). `undefined` = le service IA retombe sur le français
   * lui-même ; cette couche ne devine ni ne valide un enum fermé.
   */
  interfaceLanguage?: string | null
  /**
   * LE FUSEAU DE LA PERSONNE, nom IANA (décision Louis, 14/09/2026), lu sur son
   * profil par `ChatContextService.resolveTimezone` — jamais envoyé par le
   * navigateur, contrairement à `interfaceLanguage` juste au-dessus : la langue
   * est celle de l'INTERFACE ouverte, le fuseau est un réglage de la PERSONNE.
   *
   * Absent / `null` = clé omise = le service IA garde `REFERENCE_TIMEZONE`.
   */
  timezone?: string | null
  /**
   * #1958.2 — LE FUSEAU DE L'ESPACE, lu par `ChatContextService.resolveWorkspaceTimezone`
   * (`workspaces.timezone`) — jamais envoyé par le navigateur, même chemin que
   * `timezone` juste au-dessus. C'est la marche juste avant le fuseau de
   * RÉFÉRENCE dans l'escalier du service IA (`resolve_applicable_timezone`) :
   * personne → rendez-vous → espace → défaut produit.
   *
   * Absent / `null` = clé omise = le service IA garde son escalier d'avant ce
   * lot (personne → défaut nommé), comportement byte-identique.
   */
  workspaceTimezone?: string | null
  /**
   * #2266.8 (épopée #2920) — DEPUIS QUAND l'espace utilise Bellum
   * (`workspaces.created_at`, `ChatContextService.resolveWorkspaceCreatedAt`) —
   * jamais envoyé par le navigateur, même chemin que `workspaceTimezone`
   * juste au-dessus. Rend le bloc « PÉRIODE ET JOURS FÉRIÉS » côté IA
   * (`app/prompts/temporal_grounding.py`).
   *
   * Absent / `null` = clé omise = le service IA ne peut pas dater
   * l'ancienneté de l'espace, il ne l'affirme donc jamais — comportement
   * byte-identique à avant ce lot.
   */
  workspaceCreatedAt?: string | null
  /**
   * #2266.10 (épopée #2920) — QUAND l'espace a vu sa dernière collecte de
   * données réussie (`ChatContextService.resolveWorkspaceLastSyncAt`) — jamais
   * envoyé par le navigateur, même chemin que `workspaceCreatedAt` juste
   * au-dessus. Rend le même bloc « PÉRIODE ET JOURS FÉRIÉS » côté IA
   * (`app/prompts/temporal_grounding.py`).
   *
   * Absent / `null` = clé omise = aucune collecte connue nulle part dans
   * l'espace, le service IA ne l'affirme jamais.
   */
  workspaceLastSyncAt?: string | null
  /**
   * #1954.7 — le FIL courant (même espace de noms que `chatSchema.conversationId`).
   * Borne la lecture d'un document joint `scope: 'conversation'` côté service
   * IA (`rag_service.fetch_documents_by_ids`). Absent = clé omise = aucun
   * document de fil lisible (fail closed), jamais un élargissement. #1954 — le
   * contrôleur l'omet aussi pour un fil RANGÉ
   * (`ChatThreadDocumentsService.readableThread`).
   */
  conversationId?: string | null
  /**
   * #1951.2 / #1951.3 — la fiche du consultant ou du besoin sur lequel le fil
   * est cadré, RENDUE par le contrôleur après relecture dans l'espace actif
   * (`renderChatScopeObject`). Absent = clé omise = aucun bloc côté service IA.
   */
  scopeObject?: string | null
  /**
   * #2453 — le mode de contexte du tour. Absent = clé omise = le service IA ne
   * retire aucune couche (comportement d'avant, corps byte-identique).
   */
  contextMode?: LauraContextMode | null
  /**
   * #3772.5 — exclusion stricte des données de l'espace pour CE tour. `true` =
   * le service IA vide le portefeuille et retire les outils qui lisent l'espace.
   * Absent = clé omise (corps d'avant).
   */
  excludeWorkspaceData?: boolean
  /**
   * #2450.1 (reste partiel, épopée #2882) — le MODE DE RECHERCHE du tour.
   * Absent/`'auto'` = clé omise = l'heuristique habituelle décide (comportement
   * d'avant ce champ, corps byte-identique). Distinct de `contextMode`
   * juste au-dessus : QUELLE PROFONDEUR de recherche, pas QUELLES COUCHES.
   */
  mode?: ChatResearchMode | null
  /** #3708 — familles d'outils exclues pour ce tour (« Outils et sources »). */
  excludedToolFamilies?: readonly string[] | null
  excludedToolProviders?: readonly string[] | null
  /**
   * #3768 (BEL-LAU-1014) — le geste « retravailler cette réponse ». Absent = clé
   * omise = tour ordinaire, corps byte-identique (même discipline que `mode`).
   */
  replyTransform?: ReplyTransformRequest | null
  /** #4397 (N1) — l'objet d'une suite cliquée. Absent = clé omise = corps d'avant. */
  followUpRef?: FollowUpRef | null
  /**
   * #1950.17 — le plafond de coût AGRÉGÉ d'une réponse, en crédits, lu dans la
   * grille (`LAURA_REPLY_COST_CEILING_CREDITS`). Absent = clé omise = aucun
   * plafond côté service IA (la route MCP ne le fournit pas).
   */
  replyCostCeiling?: number | null
  /**
   * #1927.10 — l'état structuré du fil, rechargé par le contexte de chat.
   * Absent / `null` = clé omise = prompt IA byte-identique à celui d'avant.
   */
  threadState?: ConversationThreadState | null
  /**
   * #1919.15 — les retours de CETTE personne sur les réponses de Laura, déjà
   * condensés (`assembleReplyFeedbackMemory`). Vide / absent = aucun bloc côté
   * service IA, prompt inchangé.
   */
  replyFeedback?: string | null
}
