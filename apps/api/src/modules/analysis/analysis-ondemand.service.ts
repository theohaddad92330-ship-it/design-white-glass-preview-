import { InjectQueue } from '@nestjs/bullmq'
import { demoOrgDocumentPeople } from '../demo/demo-org-document'
import type { AccumulatedRouteCriteria, RouteSignals } from '../account-access/route-signals'
import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import type { Queue } from 'bullmq'
import { HttpError } from '@bellum/errors'
import { failure, isFailure, success, type Result } from '@bellum/utils'
import type {
  AnalysisAttackAngle,
  DeclareOrgPeopleRequest,
  OrgImportPreviewResponse,
  DeclareOrgPeopleResponse,
  OrgDeclaredPerson,
  AnalysisContactSeed,
  AnalysisEnrichedContact,
  AnalysisPlanData,
  AnalysisResearchData,
  ContactScope,
  StrategyScope,
  UserAttackAngle,
} from '@bellum/contracts'
import {
  esnAnswersToProfileData,
  type OrgHierarchyRelation,
  type OrgSource,
  creditCostOf,
  addressabilitySchema,
  ADDRESSABILITY_AXES,
  type Addressability,
} from '@bellum/contracts'
import type { AccountEntity } from '../../database/entities/account.entity'
import type { ContactEntity } from '../../database/entities/contact.entity'
import { AccountFeedbackService } from '../account-feedback/account-feedback.service'
import { AccountsService } from '../accounts/accounts.service'
import { ContactsService } from '../contacts/contacts.service'
import { CrmReadService } from '../crm/crm-read.service'
import { domainFromWebsite } from '../crm/crm-presence'
import { CreditsService } from '../credits/credits.service'
import { EsnProfileReader } from '../esn-profile/esn-profile-reader.service'
import { IaClient } from '../ia/ia.client'
import { AnalysisFactsInputsService } from './analysis-facts-inputs.service'
import type { AnalysisAccountFact } from './analysis-facts-inputs'
import { guardDeclaredPeople } from '../org-graph/org-declare-guard'
import { OrgGraphVersionService } from '../org-graph/org-graph.service'
import { orgPersonIdFor, readStoredOrgGraph } from '../org-graph/org-graph-versioning'
import { enrichDeclaredFromBellum, matchDeclaredToBellum } from '../org-graph/org-import-match'
import { SignalHistoryService } from '../signal-history/signal-history.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { AnalysisPersistenceService } from './analysis.persistence'
import {
  guardResearchForPersistence,
  linkCrmDealsFor,
  recordHistoricalNeedsFor,
  recordNeedProposalsFor,
} from './research-followups'
import { NeedProposalsService } from './need-proposals.service'
import { AnalysisRunsService } from './analysis-runs.service'
import { INTERNAL_HISTORY_SOURCE, type InternalHistorySource } from './internal-history-source'
import { MARKET_PATH_AXIS_SOURCE, type MarketPathAxisSource } from './market-path-axis-source'
import { RelationAxisReaderService } from './relation-axis-reader.service'
import {
  SellerHypothesesReader,
  discoverOriginOfAccount,
  withDiscoverOrigin,
  type SellerHypothesesForRun,
} from './seller-hypotheses.reader'
import { contactSearchExcludedBy } from './analysis-scope'
import { BATCH_LANE_EXTRA_MS, PHASE_TIMEOUT_MS } from './analysis.constants'
import {
  ORG_REBUILD_JOB_OPTIONS,
  ORG_REBUILD_QUEUE,
  orgRebuildJobId,
  type OrgRebuildJobData,
} from './org-rebuild.queue'
import { relationStatusForRun } from './commercial-status'
import { ORG_TEXT_MAX_CHARS } from './dto/declare-org-people.dto'
import { readExtractedText, readFailureDetail } from '../ia/document-extraction-envelope'

type OnDemandFailureCode = 'not_found' | 'ia_failed' | 'precondition_failed'

export type OnDemandFailure = {
  code: OnDemandFailureCode
  message: string
}

/** Remonte la chaîne `cause` (`HttpClient` empile `TechnicalError` →
 *  éventuellement `HttpRetriesExhaustedError` → `HttpError`) jusqu'au premier
 *  `HttpError`, ou `undefined` si l'échec n'a jamais eu de réponse HTTP
 *  (réseau, time-out). Bornée par un `Set` : jamais de boucle. */
function findHttpError(err: unknown): HttpError | undefined {
  const seen = new Set<unknown>()
  let current: unknown = err
  while (current && !seen.has(current)) {
    seen.add(current)
    if (current instanceof HttpError) return current
    current = (current as { cause?: unknown }).cause
  }
  return undefined
}

/** Le `detail` d'un corps FastAPI (`{"detail": "..."}`), ou `undefined` si le
 *  corps n'est pas ce JSON — jamais une supposition sur un corps qu'on ne
 *  comprend pas. */
function readIaDetail(body: string): string | undefined {
  try {
    const detail = (JSON.parse(body) as { detail?: unknown } | null)?.detail
    return typeof detail === 'string' && detail.trim() ? detail.trim() : undefined
  } catch {
    return undefined
  }
}

/**
 * #3740 — recette prod 08/10 : un PNG déposé dans « Charger un organigramme »
 * rendait 502 « HTTP request failed ». Cause racine : `proposeOrgPeopleFromFile`
 * et `proposeOrgPeopleFromText` traitaient TOUT rejet de `IaClient` comme une
 * PANNE (`ia_failed` → `BadGatewayException`, 502), sans jamais regarder son
 * statut HTTP. Un refus NOMMÉ du service IA (422 — fichier illisible, format
 * non supporté…) est pourtant une réponse, pas une panne : il devient ici
 * `precondition_failed` (409, avec le motif réel) ; seul un échec SANS réponse
 * HTTP 4xx (5xx, time-out, réseau) reste `ia_failed`.
 */
function classifyIaFailure(err: unknown, fallbackMessage: string): OnDemandFailure {
  const httpError = findHttpError(err)
  if (httpError && httpError.status >= 400 && httpError.status < 500) {
    return { code: 'precondition_failed', message: readIaDetail(httpError.body) ?? fallbackMessage }
  }
  return { code: 'ia_failed', message: err instanceof Error ? err.message : fallbackMessage }
}

/** #3740 — ce dépôt ne lit AUCUNE image dans l'extraction documentaire
 *  (`document_text.py`, apps/ia) : pas de calque texte à y trouver, et son
 *  seul chemin image (`extract_image_text`) demande un appel modèle séparé,
 *  jamais branché sur `/cv/extract`. Nommer le refus ICI, avant tout appel,
 *  évite le détour par le service IA — zéro réseau, zéro crédit débité —
 *  plutôt que de laisser `/cv/extract` échouer puis `classifyIaFailure`
 *  retomber sur un message générique. Même liste, même phrase
 *  qu'`org_declare.py:_IMAGE_EXTENSIONS` (apps/ia) : les deux dépôts ne
 *  partagent aucune constante, le mot est recopié consciemment. */
const ORG_FILE_IMAGE_EXTENSIONS = /\.(png|jpe?g|webp)$/i
const ORG_FILE_IMAGE_REFUSAL_MESSAGE =
  'Les organigrammes en image ne sont pas encore lus (aucun OCR). ' +
  'Dépose un PDF, un classeur Excel (.xlsx), une présentation (.pptx), ou décris-le dans le champ texte.'

/**
 * #2532.2 bis (retour BOUYGUES CONSTRUCTION, 19/09/2026) — le RÉSULTAT d'une
 * recherche par thème, tel que l'IA (`themeSearch` dans le payload de
 * `phase2_contacts._contacts`) l'a mesuré. `matchedCount`/`matchedNames`
 * portent les contacts qui correspondent RÉELLEMENT au thème ; `outOfThemeCount`
 * ceux entrés par cette recherche (Apollo + repli) mais SANS rapport avec lui —
 * comptés à part, jamais attribués en silence.
 *
 * `presetMatched` (#2532.2, 21/09/2026) — le thème a-t-il reconnu une des 10
 * familles de `contact_themes.py` (5 IT + 5 hors IT depuis ce lot) ? `false`
 * signifie une recherche retombée sur le mot-clé brut + sa variante de genre
 * (`raw_fallback` côté IA) — jamais un échec, mais jamais un silence non plus :
 * l'écran DOIT le dire (« aucun préréglage pour ce thème »).
 */
type EnrichThemeSearchResult = {
  theme: string
  titles: string[]
  matchedCount: number
  matchedNames: string[]
  outOfThemeCount: number
  presetMatched: boolean
}

/**
 * Synchronous, single-phase IA runs for the "Enrichir" buttons in the
 * AccountDetail UI. Different from the BullMQ-driven 4-phase pipeline:
 * - No queue, no retries, no DLQ — fits a user click that wants results
 *   inside one request/response.
 * - No progressCallback / Socket.IO events — the frontend just shows a
 *   button spinner and refreshes once the response lands.
 * - No persistence in the worker; we save inline via
 *   AnalysisPersistenceService so the contracts stay aligned with the
 *   full pipeline.
 */
@Injectable()
export class AnalysisOnDemandService {
  private readonly logger = new Logger(AnalysisOnDemandService.name)

  constructor(
    private readonly accounts: AccountsService,
    private readonly contacts: ContactsService,
    private readonly ia: IaClient,
    private readonly persistence: AnalysisPersistenceService,
    private readonly esnProfile: EsnProfileReader,
    // Mémoire de corrections (feedback loop A2) — `@Optional()` pour que les
    // specs à constructeur nu restent valides. Absent = payload IA inchangé.
    @Optional() private readonly accountFeedback?: AccountFeedbackService,
    // Demo-mode guard (C1) — `@Optional()` for the same reason. Absent (unit
    // specs) ⇒ no demo check ⇒ real behaviour untouched. Wired in AnalysisModule.
    @Optional() private readonly workspaceContext?: WorkspaceContextService,
    // Couche zéro CRM (annexe méthodo p8) — `@Optional()` pour la même raison.
    // Absent (unit specs) ⇒ aucun relevé ⇒ payload IA inchangé.
    @Optional() private readonly crmRead?: CrmReadService,
    // Historique de signal (V2 §11) — `@Optional()` pour la même raison. Absent
    // (specs unitaires) ⇒ aucune historisation, le refresh est inchangé.
    @Optional() private readonly signalHistory?: SignalHistoryService,
    // Graphe d'organigramme (annexe organigramme §5/§6) — `@Optional()` pour la
    // même raison. Absent ⇒ « recalculer le chemin » refuse proprement, les
    // autres actions à la demande sont inchangées.
    @Optional() private readonly orgGraph?: OrgGraphVersionService,
    // Cadrage confirmé du run (Théo p8) — `@Optional()` pour la même raison.
    // Absent (specs à constructeur nu) ⇒ aucune borne de périmètre sur la
    // recherche ciblée, comportement inchangé.
    @Optional() private readonly runs?: AnalysisRunsService,
    // Débit de la vérification de relation (§9 / P1-03) — `@Optional()` pour la
    // même raison que ses voisins. Absent (specs à constructeur nu) ⇒ aucun
    // débit, la vérification fonctionne exactement comme avant.
    @Optional() private readonly credits?: CreditsService,
    // File de reconstruction du graphe (voir `org-rebuild.queue.ts`). `@Optional()`
    // pour la même raison. Absente (specs à constructeur nu) ⇒ rien n'est enfilé
    // et la recherche ciblée le DIT (`organigramRebuild: 'unavailable'`) au lieu
    // de laisser croire que la carte va se mettre à jour toute seule.
    @Optional() @InjectQueue(ORG_REBUILD_QUEUE) private readonly orgRebuildQueue?: Queue<OrgRebuildJobData>,
    // Axe CHEMIN (#1631.3/.4, lot 14) — `@Optional()` pour la même raison que
    // ses voisins. Absent (specs à constructeur nu) ⇒ aucun axe résolu ⇒
    // requête IA byte-identique. Ajouté en DERNIER : un optionnel inséré au
    // milieu décale les specs qui construisent ce service positionnellement.
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
    // que ses voisins. Absent (specs à constructeur nu) ⇒ aucun axe résolu ⇒
    // requête IA byte-identique. Ajouté en DERNIER, même discipline que
    // `marketMemory` juste au-dessus.
    @Optional() private readonly relationAxis?: RelationAxisReaderService,
    // #3753.3 — le ciblage de l'ESN : un « Rafraîchir » (phase 1 seule) ne doit pas
    // le perdre. `@Optional()`, ajouté en DERNIER, même discipline que ses voisins.
    @Optional() private readonly sellerHypothesesReader?: SellerHypothesesReader,
    // #4070.2/.4 — les faits du compte (socle #4069), les motifs de perte et l'analyse
    // précédente : seul le graphe complet (lancement + reprise) les portait, les chemins
    // à la demande (research seule, re-plan) en repartaient sans l'historique. Même
    // lecteur UNIQUE que le lancement (`AnalysisFactsInputsService`, GA-07 : ce fichier
    // ne connaît pas `AccountFactsService`). `@Optional()`, ajouté en DERNIER, même
    // discipline que ses voisins. Absent (specs à constructeur nu) ⇒ aucune clé ⇒
    // requête IA byte-identique à avant ce lot.
    @Optional() private readonly factsInputs?: AnalysisFactsInputsService,
    // #4687 — l'historique interne (Drive, notes, e-mails, ATS DE L'ESPACE), relu SEULEMENT par le rejeu ciblé du
    // segment (`options.internalHistory`). Par un port, comme `marketMemory` (GA-07). `@Optional()`, en DERNIER.
    @Optional() @Inject(INTERNAL_HISTORY_SOURCE) private readonly internalHistorySource?: InternalHistorySource,
    // Lot 762 P4 — propositions de besoins à l'actualisation (parité avec l'analyse). `@Optional()`, en DERNIER.
    @Optional() private readonly needProposals?: NeedProposalsService,
  ) {}

  /**
   * #4070.2/.4 — ce que le socle des faits du compte ajoute aux chemins À LA DEMANDE
   * (research seule, re-plan). Même contrat que `AnalysisService.resolveFactsInputs`
   * pour le lancement complet, réduit à ce que `research`/`plan` acceptent : pas de
   * `knownContacts` (la classification des contacts ne tourne pas sur ces chemins).
   * Sans espace sur le compte (legacy) ou sans lecteur (specs à constructeur nu) :
   * aucune clé, requête byte-identique à avant ce lot.
   */
  private async resolveFactsInputs(
    account: { id: string; workspace_id?: string | null },
    userId: string,
  ): Promise<{ accountFacts?: AnalysisAccountFact[]; previousAnalysis?: string; lostDealRex?: string }> {
    const workspaceId = account.workspace_id
    if (!this.factsInputs || !workspaceId) return {}
    const scope = { workspaceId, accountId: account.id, userId }
    const [facts, previousAnalysis] = await Promise.all([
      this.factsInputs.accountFacts(scope),
      this.factsInputs.previousAnalysis(scope),
    ])
    return {
      ...facts,
      ...(previousAnalysis ? { previousAnalysis } : {}),
    }
  }

  /**
   * Demo workspace (demo mode C1): every on-demand IA re-run is refused — the
   * seeded golden dossiers are FROZEN (a phase re-run would overwrite the
   * curated contacts/plan with junk from a fictional-company lookup) and a demo
   * must never pay a real IA/provider call. Returns the failure to surface, or
   * `null` on the real (non-demo) path.
   */
  private async demoGuard(userId: string): Promise<OnDemandFailure | null> {
    if (!this.workspaceContext) return null
    if (!(await this.workspaceContext.isDemoWorkspace(userId))) return null
    return {
      code: 'precondition_failed',
      message: 'Espace de démonstration : les dossiers de démo sont figés — les actions IA sont désactivées.',
    }
  }

  /**
   * Portée équipe pour le grounding RAG d'un re-run à la demande. La base de
   * connaissance de l'ESN est un actif d'entreprise : un « Actualiser » lancé par
   * un commercial doit s'ancrer sur les références chargées par TOUTE l'équipe.
   *
   * `undefined` quand la workspace n'est pas résolvable (specs à constructeur nu,
   * ou résolution en échec) : la clé n'est alors pas envoyée et l'IA retombe sur
   * la portée per-user historique — jamais un élargissement.
   */
  private async resolveWorkspaceId(userId: string): Promise<string | undefined> {
    if (!this.workspaceContext) return undefined
    try {
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
      return workspaceId
    } catch {
      return undefined
    }
  }

  /** Directives de correction du compte (A2) pour un refresh ciblé — `undefined`
   *  sans feedback / sans service, si bien que le payload IA reste byte-identique.
   *  Best-effort : `directivesFor` dégrade déjà en `''` sur erreur. */
  private async resolveAccountFeedback(account: AccountEntity): Promise<string | undefined> {
    if (!this.accountFeedback) return undefined
    const directives = await this.accountFeedback.directivesFor({
      accountId: account.id,
      workspaceId: account.workspace_id ?? null,
      companyName: account.company_name,
    })
    return directives || undefined
  }

  /** #3753.3 — `{ sellerHypotheses }` ou `{}` : le ciblage fourni par l'ESN, jamais deviné. */
  private async sellerHypothesesOf(account: AccountEntity): Promise<{ sellerHypotheses?: SellerHypothesesForRun }> {
    const fromTargeting = this.sellerHypothesesReader
      ? await this.sellerHypothesesReader.forAccount(account.id, account.workspace_id)
      : undefined
    // #3819 (lot RBB) — la raison et les critères Découvrir persistés suivent aussi la phase relancée.
    const sellerHypotheses = withDiscoverOrigin(fromTargeting, discoverOriginOfAccount(account))
    return sellerHypotheses ? { sellerHypotheses } : {}
  }

  /**
   * Couche zéro (annexe méthodo p8 : « chercher ce qui existe avant de proposer
   * du froid ») : le relevé du CRM connecté de l'ESN sur CE compte. `undefined`
   * sans service (spec à constructeur nu), sans CRM connecté (cas par défaut,
   * zéro appel réseau) ou sans match — le payload IA reste alors byte-identique.
   */
  private async resolveCrmPresence(account: AccountEntity, userId: string): Promise<string | undefined> {
    if (!this.crmRead) return undefined
    return this.crmRead.describeAccountHistory(userId, {
      companyName: account.company_name,
      website: account.website ?? null,
      siren: account.siren ?? null,
    })
  }

  /**
   * #4687 — l'historique interne du compte, lu avec la connexion de l'ESPACE DU COMPTE (jamais celle de l'utilisateur
   * qui lance, jamais l'environnement seul). Isolé comme à l'analyse : une source qui tombe ne fait pas tomber le
   * rejeu — la clé est alors omise et la recherche repart comme avant.
   */
  private async resolveInternalHistory(account: AccountEntity, userId: string): Promise<{ internalHistory?: string }> {
    if (!this.internalHistorySource) return {}
    try {
      const internalHistory = await this.internalHistorySource.describeInternalHistory(userId, {
        companyName: account.company_name,
        domain: domainFromWebsite(account.website ?? null),
        accountId: account.id,
        workspaceId: account.workspace_id ?? null,
      })
      return internalHistory ? { internalHistory } : {}
    } catch (error) {
      this.logger.warn('Internal history lookup failed — the research replay proceeds without it', {
        accountId: account.id,
        error: error instanceof Error ? error.message : String(error),
      })
      return {}
    }
  }

  /**
   * Axe CHEMIN de l'adressabilité (#1631.3/.4, #1606.2, lot 14 — même mirroir
   * que {@link resolveCrmPresence}) : le compte de parcours AGRÉGÉ que la
   * mémoire marché a observés vers ce compte, et l'ESN la plus observée pour
   * NOMMER la preuve. `MarketMemoryService` est la SEULE porte vers les
   * tables partagées (GA-258) — `pathAxisFor` est sa dérivation dédiée.
   *
   * `{}` sans service (specs à constructeur nu), sans couverture, ou sous le
   * seuil transverse : la requête IA reste alors byte-identique à avant ce
   * lot, et l'axe `path` reste NON MESURÉ côté IA — jamais un `0`.
   */
  private async resolveMarketPathAxis(
    account: Pick<AccountEntity, 'company_name' | 'website' | 'registry_country'>,
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
   * #2298.4 (décision Louis 19/09/2026) — les QUATRE sources ajoutées à l'axe
   * RELATION pour un refresh à la demande (« Actualiser »), même mirroir que
   * {@link resolveMarketPathAxis} et que `AnalysisService.resolveRelationAxis`.
   *
   * `{}` sans service (specs à constructeur nu) ou sans AUCUNE source réelle :
   * la requête IA reste alors byte-identique, et l'axe `relation` reste NON
   * MESURÉ côté IA quand le CRM non plus n'a rien trouvé — jamais un `0`.
   */
  private async resolveRelationAxis(
    account: Pick<AccountEntity, 'relationship_memory'>,
    accountId: string,
  ): Promise<{
    relationMissionsCount?: number
    relationLastMeetingAt?: string
    relationLastEmailAt?: string
    /** #4680 — contacts CONNUS (import / CRM) déjà rattachés au compte. */
    relationKnownContactsCount?: number
    relationHumanCorrection?: string
    declaredPartners?: string[]
    consultantHistory?: 'present' | 'former'
    /** #3278 — un signal d'achat DÉCLARÉ existe sur le compte (route « signal entrant »). */
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
      ...(signals.knownContactsCount ? { relationKnownContactsCount: signals.knownContactsCount } : {}),
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
   * Prospection inversée déjà connue du dossier (annexe p7 canal 3 / p9). Elle est
   * calculée en phase 2 (historique de poste Apollo) et voyage avec le plan ; un
   * « changer de stratégie » ne relance PAS la phase 2, donc on la relit ici pour
   * qu'un replan ne fasse pas disparaître l'angle chaud du dossier. Rien en base
   * ⇒ `undefined` ⇒ clé absente du wire (JAMAIS de donnée inventée).
   */
  private static reverseProspectsOf(account: AccountEntity): Array<Record<string, unknown>> | undefined {
    const plan = (account.raw_analysis as { plan?: { reverseProspects?: unknown } } | null)?.plan
    const rows = plan?.reverseProspects
    if (!Array.isArray(rows)) return undefined
    const kept = rows.filter((r): r is Record<string, unknown> => r != null && typeof r === 'object')
    return kept.length > 0 ? kept : undefined
  }

  /** Re-run ONLY Phase 4 (plan) with a "change strategy" override — a different
   *  angle / entry mode / entity — reusing the stored research + contacts (Théo
   *  Palier-2 §3). Cheaper than a full re-analysis: the user explores an
   *  alternative approach (e.g. cyber instead of data) without re-paying
   *  research + contact discovery. Re-derives the ESN profile so the strategy is
   *  still profile-driven, then re-persists the fresh plan. */
  /**
   * Tout ce qui se refuse SANS calculer : espace de démonstration, compte
   * inconnu, analyse pas terminée.
   *
   * Extrait pour que la mise en file (#1092) puisse répondre immédiatement à ces
   * trois cas, comme avant — l'utilisateur ne doit pas attendre un job pour
   * apprendre que son dossier n'a pas encore de recherche. Seul le CALCUL part
   * en tâche de fond.
   *
   * `replan` le rejoue de son côté : le compte peut avoir changé entre le clic
   * et l'exécution, et un préflight qui vaudrait garantie serait faux.
   */
  async preflightReplan(accountId: string, userId: string): Promise<Result<{ ready: true }, OnDemandFailure>> {
    const demoRefusal = await this.demoGuard(userId)
    if (demoRefusal) return failure(demoRefusal)
    const accountResult = await this.accounts.findOne(accountId, userId)
    if (isFailure(accountResult)) {
      return failure({ code: 'not_found', message: accountResult.problem.message })
    }
    const account = accountResult.output
    const existingContacts = await this.contacts.findByAccount(accountId, userId)
    // Precondition: never re-plan an account without an underlying analysis —
    // the plan LLM would fabricate a hollow plan from no research ("JAMAIS de
    // données fictives") and savePlan would force status→completed on a
    // pending/failed account. Require a completed analysis with research + contacts.
    const hasResearch = account.raw_analysis != null && Object.keys(account.raw_analysis).length > 0
    if (account.status !== 'completed' || !hasResearch || existingContacts.length === 0) {
      return failure({
        code: 'precondition_failed',
        message:
          "Impossible de changer de stratégie : l'analyse doit être terminée (recherche + contacts) avant de re-planifier.",
      })
    }
    return success({ ready: true })
  }

  async replan(
    accountId: string,
    userId: string,
    strategy?: StrategyScope,
  ): Promise<Result<{ replanned: true }, OnDemandFailure>> {
    const preflight = await this.preflightReplan(accountId, userId)
    if (isFailure(preflight)) return preflight
    const accountResult = await this.accounts.findOne(accountId, userId)
    if (isFailure(accountResult)) {
      return failure({ code: 'not_found', message: accountResult.problem.message })
    }
    const account = accountResult.output
    const existingContacts = await this.contacts.findByAccount(accountId, userId)
    const contacts = existingContacts.map(c => ({
      fullName: c.full_name,
      title: c.title ?? '',
      entity: c.entity ?? '',
      role: c.decision_role ?? '',
      priority: c.priority ?? 0,
      // #219.8 (#3231) — la relation DÉCLARÉE par le commercial ; absente → clé omise.
      ...(c.declared_person_company_relation
        ? { declaredPersonCompanyRelation: c.declared_person_company_relation }
        : {}),
    }))

    this.logger.log('On-demand replan (change strategy)', {
      accountId,
      userId,
      companyName: account.company_name,
      strategy,
    })

    // Re-derive the ESN profile so the re-plan stays profile-driven (Théo: the
    // profile pilots the strategy) — not just the raw research blob.
    const profileData = await this.esnProfile.resolveProfileData(userId)

    // Mémoire de corrections (A2) : le refresh stratégie du MÊME compte reçoit
    // les directives issues des retours utilisateur (« play X hors sujet »…).
    const accountFeedback = await this.resolveAccountFeedback(account)

    // #4070.2/.4 — faits du compte, motifs de perte, analyse précédente : sans eux,
    // « changer de stratégie » ramène le compte à une approche froide.
    const factsInputs = await this.resolveFactsInputs(account, userId)

    let response: Awaited<ReturnType<IaClient['plan']>>
    try {
      response = await this.ia.plan(
        {
          accountId,
          userId,
          workspaceId: await this.resolveWorkspaceId(userId),
          accountData: {
            ...((account.raw_analysis ?? {}) as Record<string, unknown>),
            // #219.6 (#3231) — la déclaration « client interne » vit sur la colonne
            // du compte ; absente → clé omise, plan byte-identique.
            ...(account.declared_internal_client_mode
              ? { declared_internal_client_mode: account.declared_internal_client_mode }
              : {}),
            // #219.6 (J05) — les rôles nommés à la main ; absent → clé omise.
            ...(account.declared_internal_sponsor
              ? { declared_internal_sponsor: account.declared_internal_sponsor }
              : {}),
            ...(account.declared_internal_users ? { declared_internal_users: account.declared_internal_users } : {}),
            ...(account.declared_legal_entity ? { declared_legal_entity: account.declared_legal_entity } : {}),
            ...(account.declared_end_client ? { declared_end_client: account.declared_end_client } : {}),
          },
          contacts,
          profileData: profileData as Record<string, unknown>,
          accountFeedback,
          // Couche zéro (annexe p7-p9) : un re-plan doit rester conscient de
          // l'historique CRM et des ex-collaborateurs — sinon « changer de
          // stratégie » ramène le compte à une approche froide.
          crmPresence: await this.resolveCrmPresence(account, userId),
          reverseProspects: AnalysisOnDemandService.reverseProspectsOf(account),
          strategyScope: strategy,
          // #3278 — les signaux de route relus en base à CET appel : le plan ne relit sinon que
          // le SalesContext persisté à la recherche, et « filiale » restait la seule route.
          ...(await this.resolveRelationAxis(account, accountId)),
          ...factsInputs,
        },
        // Phase-4 runs minutes; a single attempt avoids re-billing a slow-but-fine plan.
        { timeoutMs: PHASE_TIMEOUT_MS.plan, maxAttempts: 1 },
      )
    } catch (err) {
      this.logger.error('On-demand replan call failed', { error: err, accountId })
      return failure({
        code: 'ia_failed',
        message: err instanceof Error ? err.message : 'Impossible de re-générer la stratégie.',
      })
    }

    const data = response.data as AnalysisPlanData | undefined
    if (data) {
      await this.persistence.savePlan(accountId, userId, data)
    }
    // Le plan vient d'être re-planifié : on efface le repère « à actualiser »
    // (annexe méthodo p27). Best-effort — un échec ici ne doit pas faire échouer
    // le replan déjà persisté.
    try {
      await this.accounts.clearReplanSuggested(accountId, userId)
    } catch (cause) {
      this.logger.warn('clearReplanSuggested failed', { error: cause, accountId })
    }
    return success({ replanned: true })
  }

  /** Re-run Phase 2 (contact discovery) for an existing account. Used by the
   *  "Enrichir contacts" button when the original analysis returned an empty
   *  list. Returns the persisted contact rows. */
  async enrichContacts(
    accountId: string,
    userId: string,
    scope?: ContactScope,
  ): Promise<
    Result<
      {
        count: number
        identified: number
        organigramRebuild: 'skipped' | 'queued' | 'unavailable'
        // #2532.2 bis (retour BOUYGUES CONSTRUCTION, 19/09/2026) — le RÉSULTAT
        // d'une recherche par thème, tel que l'IA l'a mesuré : combien de
        // contacts portent RÉELLEMENT la provenance de ce thème, et combien sont
        // entrés par cette recherche sans rapport avec lui (comptés à part,
        // jamais attribués). Absent sur une recherche non thématisée — non
        // mesuré, jamais un 0 inventé (GA-18/19).
        themeSearch?: EnrichThemeSearchResult
        // C.2 (Cédric 20/10) — d'où vient l'ancre d'organisation de la recherche
        // (`none` = limitée au nom de l'entreprise). Absent = non mesuré.
        orgAnchorSource?: 'enrichment' | 'website' | 'explicit' | 'none'
      },
      OnDemandFailure
    >
  > {
    const demoRefusal = await this.demoGuard(userId)
    if (demoRefusal) return failure(demoRefusal)
    const accountResult = await this.accounts.findOne(accountId, userId)
    if (isFailure(accountResult)) {
      return failure({ code: 'not_found', message: accountResult.problem.message })
    }
    const account = accountResult.output

    // Le cadrage MORD EN AMONT (Théo p8 : « corriger le scope AVANT de payer la
    // collecte » ; p22 : « ne jamais réinjecter »). C'est la seule collecte dont
    // l'API tient le déclencheur : si cette recherche ciblée vise une entité ou
    // un thème que le commercial a écarté à la confirmation du run, on REFUSE
    // avant l'appel Apollo/LLM — zéro réseau, zéro crédit. Les recherches larges
    // (sans entité/thème) et les comptes sans cadrage passent, inchangés.
    if (scope && this.runs) {
      const selection = await this.runs.getScopeSelection(accountId)
      const excluded = contactSearchExcludedBy(scope, selection ?? undefined)
      if (excluded) {
        return failure({
          code: 'precondition_failed',
          message:
            excluded.field === 'entity'
              ? `« ${excluded.label} » a été exclue du périmètre au lancement de l'analyse : cette recherche ciblée est bloquée pour ne pas réintroduire une entité écartée. Modifie le périmètre pour la réinclure.`
              : `Le thème « ${excluded.label} » a été exclu du périmètre au lancement de l'analyse : cette recherche ciblée est bloquée pour ne pas réintroduire un thème écarté. Modifie le périmètre pour le réinclure.`,
        })
      }
    }

    this.logger.log('On-demand contacts enrichment', {
      accountId,
      userId,
      companyName: account.company_name,
      scope,
    })

    // C.2 (Cédric 20/10) — « Agrandir la recherche » partait sans ancre d'organisation
    // (log IA : org_ids=0 org_domains=0) : on lit celle que le run complet a posée.
    const anchor = readOrgAnchor(account.raw_analysis)

    let response: Awaited<ReturnType<IaClient['contacts']>>
    try {
      response = await this.ia.contacts(
        {
          companyName: account.company_name,
          profileData: (account.raw_analysis ?? {}) as Record<string, unknown>,
          accountId,
          userId,
          ...anchor,
          // S6 re-run scope — narrow to a persona/geo/entity/role. saveContacts
          // dedupes by full_name, so a scoped re-run MERGES into the existing set
          // (adds/updates the targeted segment) rather than overwriting it.
          scope,
        },
        // Phase-2 discovery runs minutes, not the HttpClient default 30s; a
        // single attempt avoids re-billing Apollo/Brave on a slow-but-fine run.
        { timeoutMs: PHASE_TIMEOUT_MS.contacts, maxAttempts: 1 },
      )
    } catch (err) {
      this.logger.error('On-demand contacts call failed', { error: err, accountId })
      return failure({
        code: 'ia_failed',
        message: err instanceof Error ? err.message : "Impossible d'enrichir les contacts.",
      })
    }

    const items = (response.data?.contacts as AnalysisContactSeed[] | undefined) ?? []
    const created = await this.persistence.saveContacts(accountId, userId, items)
    // Same « X écartés (hors périmètre) » reporting as the full run: a scoped
    // re-run that hits an out-of-perimeter entity must say so too. No-op when
    // nothing was dropped, so a re-run never erases an existing count with a 0.
    await this.persistence.saveContactsOutOfScope(accountId, response.data?.outOfScope)
    // #2532.2 bis — le RÉSULTAT d'une recherche par thème se dit, à l'endroit
    // du geste, jamais seulement un compteur global qui bouge en silence.
    const themeSearch = parseThemeSearchResult(response.data?.themeSearch)
    const orgAnchorSource = parseOrgAnchorSource(response.data?.orgAnchorSource)
    // Deux nombres, pas un : ce que la recherche a TROUVÉ et ce qui est
    // réellement ENTRÉ au dossier. L'écart n'est pas une anomalie — un contact
    // déjà connu est fusionné, une identité insuffisante (prénom seul, sans
    // LinkedIn ni email) est refusée à la porte. Annoncer « 2 contacts
    // identifiés » quand la base n'en a gardé aucun, c'est envoyer le commercial
    // chercher dans une liste inchangée.
    return success({
      count: created,
      identified: items.length,
      organigramRebuild: await this.queueOrgRebuild(accountId, userId, created),
      ...(themeSearch ? { themeSearch } : {}),
      ...(orgAnchorSource ? { orgAnchorSource } : {}),
    })
  }

  /**
   * Met en file la reconstruction du graphe après une recherche qui a AJOUTÉ des
   * contacts (voir `org-rebuild.queue.ts` pour le pourquoi de la file).
   *
   * Enfilée seulement quand quelque chose est entré : reconstruire un graphe
   * inchangé coûterait un fan-out LLM pour un résultat identique. L'état rendu
   * distingue les trois situations, parce qu'elles n'appellent pas la même
   * phrase à l'écran : rien à faire, c'est parti, ou on ne peut pas s'en charger.
   */
  private async queueOrgRebuild(
    accountId: string,
    userId: string,
    created: number,
  ): Promise<'skipped' | 'queued' | 'unavailable'> {
    if (created <= 0) return 'skipped'
    if (!this.orgRebuildQueue) return 'unavailable'
    try {
      await this.orgRebuildQueue.add(
        'rebuild',
        { accountId, userId },
        { ...ORG_REBUILD_JOB_OPTIONS, jobId: orgRebuildJobId(accountId) },
      )
      return 'queued'
    } catch (err) {
      // Les contacts sont DÉJÀ persistés : une file indisponible ne doit pas
      // faire échouer la recherche. On le dit au client plutôt que de le laisser
      // attendre une carte qui ne se mettra jamais à jour.
      this.logger.warn('Contacts ajoutés mais reconstruction du graphe non mise en file', {
        accountId,
        created,
        error: err,
      })
      return 'unavailable'
    }
  }

  /**
   * L'état de la reconstruction du graphe d'un compte — ce que le client suit
   * après une recherche ciblée. `idle` = aucune reconstruction connue (jamais
   * lancée, ou déjà expirée de Redis), ce qui n'est PAS un échec.
   */
  async orgRebuildState(
    accountId: string,
    userId: string,
  ): Promise<Result<{ state: 'idle' | 'queued' | 'active' | 'completed' | 'failed' }, OnDemandFailure>> {
    const accountResult = await this.accounts.findOne(accountId, userId)
    if (isFailure(accountResult)) {
      return failure({ code: 'not_found', message: accountResult.problem.message })
    }
    if (!this.orgRebuildQueue) return success({ state: 'idle' })
    try {
      const job = await this.orgRebuildQueue.getJob(orgRebuildJobId(accountId))
      if (!job) return success({ state: 'idle' })
      const state = await job.getState()
      if (state === 'completed') return success({ state: 'completed' })
      if (state === 'failed') return success({ state: 'failed' })
      if (state === 'active') return success({ state: 'active' })
      // waiting / delayed / prioritized / waiting-children : pas encore commencé.
      return success({ state: 'queued' })
    } catch (err) {
      // Redis illisible : on ne sait pas. Le dire `idle` ferait croire que la
      // reconstruction est finie et l'écran cesserait de suivre.
      this.logger.warn('État de reconstruction du graphe illisible', { accountId, error: err })
      return failure({ code: 'ia_failed', message: 'État de la reconstruction indisponible.' })
    }
  }

  /** Re-run Phase 3 (organigram / contact enrichment) for an account's
   *  existing contacts. Used by the "Enrichir organigramme" button. Returns
   *  the count of contacts updated, and `orgGraphUpdated` (#2755) — whether a
   *  graph was ACTUALLY (re)written, so the caller never reports success on
   *  a silent no-op (`AnalysisPersistenceService.saveOrgChart` returns
   *  `false` when the IA assembled no graph this run). */
  async enrichOrganigram(
    accountId: string,
    userId: string,
  ): Promise<Result<{ matched: number; total: number; orgGraphUpdated: boolean }, OnDemandFailure>> {
    const demoRefusal = await this.demoGuard(userId)
    if (demoRefusal) return failure(demoRefusal)
    const accountResult = await this.accounts.findOne(accountId, userId)
    if (isFailure(accountResult)) {
      return failure({ code: 'not_found', message: accountResult.problem.message })
    }
    const account = accountResult.output

    // SIMON-FIX S.18 — `findByAccount` rend aussi les contacts ÉCARTÉS (périmètre, homonymes) : l'écran ne les
    // compte pas, la classification ne les envoie pas. Une seule source de compte (recette Simon 20/10 :
    // 976 contacts avant, « 879 classés sur 1046 » après).
    const existingContacts = (await this.contacts.findByAccount(accountId, userId)).filter(
      contact => !contact.excluded_at,
    )
    if (existingContacts.length === 0) {
      return failure({
        code: 'not_found',
        message: "Aucun contact à enrichir. Lance d'abord l'enrichissement des contacts.",
      })
    }

    return this.classifyAndPersist(accountId, userId, account, existingContacts)
  }

  /**
   * Même chemin que {@link enrichOrganigram}, borné à UNE liste de contactIds —
   * le lot que le planificateur d'enrichissement (§11 FINAL) a choisi pour une
   * vague. Utilisé par `OrgEnrichmentPlannerService` : chaque appel classe SEULEMENT
   * les contacts demandés, jamais tout le compte (« pas de full rerun pour un
   * simple gap », §11).
   *
   * `contactIds` VIDE ou ne désignant aucun contact du compte ⇒ `not_found` —
   * jamais un appel IA sur un lot vide.
   */
  async enrichOrganigramWave(
    accountId: string,
    userId: string,
    contactIds: readonly string[],
  ): Promise<Result<{ matched: number; total: number; orgGraphUpdated: boolean }, OnDemandFailure>> {
    const demoRefusal = await this.demoGuard(userId)
    if (demoRefusal) return failure(demoRefusal)
    const accountResult = await this.accounts.findOne(accountId, userId)
    if (isFailure(accountResult)) {
      return failure({ code: 'not_found', message: accountResult.problem.message })
    }
    const account = accountResult.output

    const allContacts = await this.contacts.findByAccount(accountId, userId)
    const wanted = new Set(contactIds)
    const waveContacts = allContacts.filter(c => wanted.has(c.id) && !c.excluded_at)
    if (waveContacts.length === 0) {
      return failure({ code: 'not_found', message: 'Aucun des contacts de cette vague ne correspond au compte.' })
    }

    return this.classifyAndPersist(accountId, userId, account, waveContacts, true)
  }

  /**
   * Le corps partagé d'un appel à la phase 3 (classify) — préparation des
   * seeds, mémoire de corrections, profil vendeur, mémoire du graphe, l'appel
   * IA, puis la persistance. `enrichOrganigram` (tout le compte) et
   * `enrichOrganigramWave` (une vague ciblée) sont deux façons de choisir
   * `contacts` ; tout le reste ne vit qu'ICI, pour ne jamais diverger.
   */
  private async classifyAndPersist(
    accountId: string,
    userId: string,
    account: AccountEntity,
    contacts: ContactEntity[],
    /**
     * VRAI quand cet appel est une VAGUE ciblée, pas un run complet.
     *
     * La phase 3 réassemble un graphe entier à partir des seules personnes
     * qu'on lui envoie : écrire ce résultat tel quel remplacerait un graphe de
     * 2 241 personnes par un graphe de 50. On nomme donc les personnes touchées
     * pour que `saveOrgChart` FUSIONNE au lieu de remplacer. Un run complet,
     * lui, n'en nomme aucune et garde le chemin d'avant, byte pour byte.
     */
    isTargetedWave = false,
  ): Promise<Result<{ matched: number; total: number; orgGraphUpdated: boolean }, OnDemandFailure>> {
    const seeds: AnalysisContactSeed[] = contacts.map(c => ({
      fullName: c.full_name,
      title: c.title ?? '',
      linkedinUrl: c.linkedin_url ?? '',
      city: '',
      country: '',
      source: (c.source as string | null) ?? '',
    }))

    this.logger.log('On-demand organigram enrichment', {
      accountId,
      userId,
      companyName: account.company_name,
      contacts: seeds.length,
    })

    // Mémoire de corrections (A2) : « contact X n'est plus là » doit conditionner
    // la re-classification de l'organigramme du même compte.
    const accountFeedback = await this.resolveAccountFeedback(account)

    // Qui vend (annexe méthodo p3-4). `profileData` ci-dessous porte le compte CIBLE :
    // sans ce profil, le bloc « PROFIL ESN » des prompts décrivait la cible elle-même
    // et le boost vendeur du /100 notait contre un profil sans expertise déclarée.
    const esnProfile = await this.esnProfile.resolveProfileData(userId)

    // Mémoire du graphe (annexe organigramme §5) : la phase 3 RECONSTRUIT le
    // graphe. Sans elle, un enrichissement à la demande ferait revenir un contact
    // que l'utilisateur a signalé parti et ferait reculer la version.
    const orgMemory = await this.resolveOrgGraphMemory(account)

    let response: Awaited<ReturnType<IaClient['classify']>>
    try {
      response = await this.ia.classify(
        {
          accountId,
          contacts: seeds,
          profileData: (account.raw_analysis ?? {}) as Record<string, unknown>,
          esnProfile: esnProfile as Record<string, unknown>,
          accountFeedback,
          ...orgMemory,
        },
        // Phase-3 fans out N classify batches + the organigramme; minutes, one attempt.
        { timeoutMs: PHASE_TIMEOUT_MS.classify, maxAttempts: 1 },
      )
    } catch (err) {
      this.logger.error('On-demand classify call failed', { error: err, accountId })
      return failure({
        code: 'ia_failed',
        message: err instanceof Error ? err.message : "Impossible d'enrichir l'organigramme.",
      })
    }

    const items = (response.data?.contacts as AnalysisEnrichedContact[] | undefined) ?? []
    await this.persistence.saveEnriched(accountId, items)
    // Le graphe reconstruit remplace celui du run initial. C'est ce qui manquait :
    // la phase 3 à la demande classait les contacts mais laissait `raw_analysis.org`
    // intact, si bien que la carte d'influence continuait d'afficher les zones
    // blanches d'un état périmé et n'y plaçait jamais les contacts trouvés depuis.
    // No-op sur un graphe vide (IA antérieure, assemblage en échec) — #2755 :
    // la valeur de retour DIT si un graphe a réellement été écrit, pour que
    // l'appelant ne prétende jamais un succès sur ce no-op.
    const orgGraphUpdated = await this.persistence.saveOrgChart(
      accountId,
      response.data?.org_graph as Record<string, unknown> | undefined,
      {
        // `orgPersonIdFor` est le MÊME slug que celui de l'assembleur côté IA :
        // c'est ce qui rend les ids stables d'un rebuild à l'autre, donc ce qui
        // permet de reconnaître « la même personne » entre deux vagues.
        touchedPersonIds: isTargetedWave ? contacts.map(contact => orgPersonIdFor(contact.full_name)) : [],
      },
    )
    return success({ matched: items.length, total: contacts.length, orgGraphUpdated })
  }

  /**
   * La mémoire du graphe d'organigramme de ce compte (Annexe Organigramme §5) :
   * version courante + éléments écartés, sous la forme attendue par le client IA.
   * `{}` sans service (specs à constructeur nu) ou sans rien à se rappeler — le
   * payload IA est alors byte-identique à un premier run.
   */
  private async resolveOrgGraphMemory(account: AccountEntity): Promise<{
    orgGraphVersion?: number
    orgRejectedItems?: Array<{ sourceId: string; reason: string }>
  }> {
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
   * « Recalculer le chemin » (annexe organigramme §6) — réordonne la séquence
   * d'approche à partir du graphe DÉJÀ stocké : zéro recherche, zéro appel IA,
   * zéro crédit, réponse immédiate. Le bouton frère d'« Enrichir » quand seul
   * l'ORDRE est périmé (un contact vient d'être écarté, la relation est passée
   * de froide à tiède…).
   *
   * Scopé par `user_id` via `findOne`, comme les autres actions à la demande.
   */
  /**
   * Déclarer des personnes qu'on connaît et que Bellum n'a pas trouvées (#1103).
   *
   * « Ici il faudrait pouvoir […] soit charger un organigramme si on en a un,
   * soit pouvoir décrire des éléments et ensuite ça intègre. »
   *
   * **Aucun garde-fou de démonstration ici, et c'est délibéré** : celui-ci
   * refuse « les actions IA », or déclarer une personne n'appelle aucun modèle,
   * ne débite rien et n'interroge aucun fournisseur. C'est une écriture locale,
   * dans une salle de démonstration remise à neuf entre deux visiteurs — et une
   * fonctionnalité qu'un prospect ne peut pas essayer est une fonctionnalité
   * qu'on découvre vide en réunion. La porte qui STRUCTURE un texte, elle,
   * appelle bien un modèle : elle garde son refus.
   */
  async declareOrgPeople(
    accountId: string,
    userId: string,
    people: Array<Omit<OrgDeclaredPerson, 'declaredAt' | 'declaredBy'>>,
    options: { createContacts?: boolean } = {},
  ): Promise<Result<DeclareOrgPeopleResponse, OnDemandFailure>> {
    const accountResult = await this.accounts.findOne(accountId, userId)
    if (isFailure(accountResult)) {
      return failure({ code: 'not_found', message: accountResult.problem.message })
    }
    if (!this.orgGraph) {
      return failure({ code: 'precondition_failed', message: "La saisie d'organigramme n'est pas disponible." })
    }

    // #3740.2 — « si des personnes correspondent, l'enrichir avec les données de
    // Bellum » : une personne connue comme contact du compte reçoit le titre et
    // le LinkedIn que le fichier n'a pas (present-only, le fichier gagne). C'est
    // ICI, dans l'unique écriture, pour que les trois portes se comportent pareil.
    const known = await this.contacts.findByAccount(accountId, userId, null, { scored: false })
    const enriched = enrichDeclaredFromBellum(people, { contacts: known })

    // La date et l'auteur sont posés ICI : une date d'origine cliente se règle,
    // et un auteur choisi par l'appelant n'est pas un auteur.
    const declaredAt = new Date().toISOString()
    const result = await this.orgGraph.declarePeople({
      accountId,
      people: enriched.map(entry => ({ ...entry, declaredAt, declaredBy: userId })),
    })
    if (!result) {
      return failure({ code: 'precondition_failed', message: "La déclaration n'a pas pu être enregistrée." })
    }
    if (!options.createContacts) return success(result)

    // #2553 / #3740 — l'organigramme importé devient aussi des contacts du compte.
    // Après le graphe : si l'écriture des contacts tombe, la déclaration reste
    // acquise (idempotente — un nouvel essai relie ce qui existe déjà).
    const imported = await this.contacts.importOrgChartPeople(
      accountId,
      userId,
      enriched.map(entry => ({
        fullName: entry.fullName,
        title: entry.title,
        entityName: entry.entityName,
        linkedinUrl: entry.linkedinUrl,
      })),
      enriched.find(entry => entry.documentDate)?.documentDate,
    )
    return success({ ...result, contacts: imported.contacts })
  }

  /**
   * #3740.1 — l'APERÇU d'un organigramme importé : pour chaque ligne, ce que
   * Bellum sait déjà (contact du compte, personne du graphe). N'écrit RIEN,
   * n'appelle aucun modèle, ne débite rien — donc ouvert en démonstration, comme
   * la déclaration qu'il précède. Même règle de rapprochement que l'écriture
   * (`org-import-match`), pour que l'aperçu ne promette pas autre chose.
   */
  async previewOrgPeople(
    accountId: string,
    userId: string,
    people: DeclareOrgPeopleRequest['people'],
  ): Promise<Result<OrgImportPreviewResponse, OnDemandFailure>> {
    const accountResult = await this.accounts.findOne(accountId, userId)
    if (isFailure(accountResult)) {
      return failure({ code: 'not_found', message: accountResult.problem.message })
    }
    const contacts = await this.contacts.findByAccount(accountId, userId, null, { scored: false })
    const graphNames = readStoredOrgGraph(accountResult.output.raw_analysis)?.people.map(p => p.fullName) ?? []
    return success({ rows: matchDeclaredToBellum(people, { contacts, graphNames }) })
  }

  /**
   * Mettre en lignes un organigramme décrit en toutes lettres (#1103).
   *
   * « soit pouvoir décrire des éléments et ensuite ça intègre. »
   *
   * Trois choses, dans cet ordre, et l'ordre EST la garantie :
   *   1. le garde-fou de démonstration s'applique — celui-ci appelle un modèle,
   *      contrairement à la saisie au formulaire ;
   *   2. le modèle met en forme, il ne décide de rien ;
   *   3. **la garde relit le texte source** et retire toute personne qui n'y est
   *      pas nommée. On ne fait pas confiance au prompt : un organigramme est ce
   *      sur quoi un commercial construit son approche, et une personne inventée
   *      envoie quelqu'un préparer un message pour un interlocuteur qui n'existe
   *      pas.
   *
   * On NE DÉCLARE RIEN ici : la route rend une PROPOSITION que l'écran affiche
   * et que l'utilisateur valide. Le clic passe ensuite par `declareOrgPeople`,
   * la seule écriture — aucun second chemin, donc aucune divergence possible.
   *
   * #3740 (reste) — `input` porte le texte tapé OU un FICHIER (PDF, .xlsx,
   * .pptx — les trois familles déjà lues par `document_text.py`, apps/ia ;
   * une image y est refusée nommément, faute d'OCR). La garde relit
   * TOUJOURS `envelope.data.resolvedText` — le texte que l'IA a réellement
   * mis en forme, qu'il vienne du champ tapé ou de l'extraction du fichier —
   * jamais `input.text`, absent pour un fichier.
   */
  async proposeOrgPeopleFromText(
    accountId: string,
    userId: string,
    input: { text: string } | { file: { base64: string; name?: string } },
  ): Promise<Result<{ people: DeclareOrgPeopleRequest['people']; dropped: string[] }, OnDemandFailure>> {
    const demoRefusal = await this.demoGuard(userId)
    if (demoRefusal) return failure(demoRefusal)
    const accountResult = await this.accounts.findOne(accountId, userId)
    if (isFailure(accountResult)) {
      return failure({ code: 'not_found', message: accountResult.problem.message })
    }

    let envelope: { data?: unknown }
    try {
      envelope = await this.ia.declareOrgFromText({
        ...('text' in input ? { text: input.text } : { file: input.file }),
        accountName: accountResult.output.company_name ?? '',
      })
    } catch (err) {
      return failure(classifyIaFailure(err, "La mise en forme n'a pas abouti."))
    }

    const data = envelope.data as { people?: unknown; resolvedText?: unknown } | undefined
    const raw = data?.people
    const proposed = Array.isArray(raw)
      ? raw
          .map(entry => {
            const row = entry as Record<string, unknown>
            const value = (key: string): string | undefined => {
              const found = row[key]
              return typeof found === 'string' && found.trim() ? found.trim() : undefined
            }
            const fullName = value('full_name') ?? value('fullName')
            if (!fullName) return null
            return {
              fullName,
              ...(value('title') ? { title: value('title')! } : {}),
              ...((value('entity_name') ?? value('entityName'))
                ? { entityName: (value('entity_name') ?? value('entityName'))! }
                : {}),
              ...((value('manager_name') ?? value('managerName'))
                ? { managerName: (value('manager_name') ?? value('managerName'))! }
                : {}),
            }
          })
          .filter((entry): entry is DeclareOrgPeopleRequest['people'][number] => entry !== null)
      : []

    // #3740 (reste) — `resolvedText` est TOUJOURS porté par l'enveloppe (texte
    // tapé ou extrait du fichier) ; absent seulement sur une réponse d'une IA
    // antérieure à ce point, où `input.text` reste le seul texte connu.
    const sourceText = typeof data?.resolvedText === 'string' ? data.resolvedText : 'text' in input ? input.text : ''
    return success(guardDeclaredPeople(proposed, sourceText))
  }

  /**
   * #2553 / #3740 — « importer mon organigramme (souvent un PDF, une image, un
   * PowerPoint de 2023-2025) ». Le fichier est lu par l'extraction documentaire
   * EXISTANTE (PDF, PPTX, image lue par le modèle), puis le texte passe par la
   * mise en lignes de `proposeOrgPeopleFromText` — donc par SA garde, qui retire
   * toute personne non nommée dans le texte lu. On PROPOSE : aucune écriture ici.
   */
  async proposeOrgPeopleFromFile(
    accountId: string,
    userId: string,
    file: { fileB64: string; filename: string },
  ): Promise<Result<{ people: DeclareOrgPeopleRequest['people']; dropped: string[] }, OnDemandFailure>> {
    const demoRefusal = await this.demoGuard(userId)
    if (demoRefusal) return failure(demoRefusal)

    // #3740 — un classeur n'est pas lu par `/cv/extract` : il part, entier, à la
    // lecture documentaire de la mise en lignes (`document_text.py` lit le .xlsx).
    if (/\.xlsx$/i.test(file.filename)) {
      return this.proposeOrgPeopleFromText(accountId, userId, {
        file: { base64: file.fileB64, name: file.filename },
      })
    }

    // #3740 — recette prod 08/10 : une image envoyée à `/cv/extract` finissait
    // en 502 (« HTTP request failed »), jamais en refus clair. Nommé ICI,
    // avant tout appel : zéro réseau, zéro crédit débité.
    if (ORG_FILE_IMAGE_EXTENSIONS.test(file.filename)) {
      return failure({ code: 'precondition_failed', message: ORG_FILE_IMAGE_REFUSAL_MESSAGE })
    }

    let envelope: unknown
    try {
      envelope = await this.ia.cvExtract({ fileB64: file.fileB64, filename: file.filename })
    } catch (err) {
      return failure(classifyIaFailure(err, "La lecture du fichier n'a pas abouti."))
    }
    const text = readExtractedText(envelope)
    if (!text) {
      // Le MOTIF voyage : « aucun texte » sans raison enverrait redéposer le même scan.
      const detail = readFailureDetail(envelope)
      return failure({
        code: 'precondition_failed',
        message: `Aucun texte lisible dans ce fichier${detail ? ` (${detail})` : ''}.`,
      })
    }
    // Au-delà de la borne de mise en lignes, on lit le début : un organigramme
    // tient en tête de document.
    return this.proposeOrgPeopleFromText(accountId, userId, { text: text.slice(0, ORG_TEXT_MAX_CHARS) })
  }

  /**
   * #4072.1 — les organigrammes PRÉSENTS dans les documents de l'espace (Drive,
   * imports). L'IA n'extrait que ce que le document ÉCRIT (aucun modèle, N+1
   * seulement s'il est écrit, date du document) ; ici on PROPOSE, rien n'est
   * écrit : la validation passe par `declareOrgPeople`. Aucun appel modèle, donc
   * lisible aussi en espace de démonstration.
   */
  async proposeOrgPeopleFromDocuments(
    accountId: string,
    userId: string,
  ): Promise<
    Result<{ people: DeclareOrgPeopleRequest['people']; documentsRead: number; truncated: boolean }, OnDemandFailure>
  > {
    const accountResult = await this.accounts.findOne(accountId, userId)
    if (isFailure(accountResult)) {
      return failure({ code: 'not_found', message: accountResult.problem.message })
    }
    // #4072.7 — espace de démonstration : le service IA n'est jamais appelé (« HTTP request failed » en recette R46).
    // La proposition vient du document semé, sans réseau ; ailleurs, la lecture réelle.
    if (this.workspaceContext && (await this.workspaceContext.isDemoWorkspace(userId))) {
      return success(demoOrgDocumentPeople((accountResult.output as { company_name?: string | null }).company_name))
    }
    let envelope: { data?: unknown }
    try {
      envelope = await this.ia.orgDocumentPeople({
        userId,
        workspaceId: (accountResult.output as { workspace_id?: string | null }).workspace_id ?? null,
        accountId,
      })
    } catch (err) {
      return failure(classifyIaFailure(err, "La lecture des documents n'a pas abouti."))
    }
    const data = envelope.data as { people?: unknown; documents_read?: unknown; truncated?: unknown } | undefined
    const text = (row: Record<string, unknown>, key: string): string | undefined => {
      const found = row[key]
      return typeof found === 'string' && found.trim() ? found.trim() : undefined
    }
    const people = (Array.isArray(data?.people) ? data.people : []).flatMap(entry => {
      const row = (entry ?? {}) as Record<string, unknown>
      const fullName = text(row, 'fullName')
      if (!fullName) return []
      const title = text(row, 'title')
      const entityName = text(row, 'entityName')
      const managerName = text(row, 'managerName')
      const documentDate = text(row, 'documentDate')
      return [
        {
          fullName,
          ...(title ? { title } : {}),
          ...(entityName ? { entityName } : {}),
          ...(managerName ? { managerName } : {}),
          ...(documentDate && /^\d{4}-\d{2}-\d{2}$/.test(documentDate) ? { documentDate } : {}),
        },
      ]
    })
    return success({
      people,
      documentsRead: typeof data?.documents_read === 'number' ? data.documents_read : 0,
      truncated: data?.truncated === true,
    })
  }

  /** Retirer une déclaration (#1103). Le nœud greffé disparaît à la prochaine
   *  réapplication ; on n'élague pas le graphe stocké, parce qu'on ne sait pas
   *  si la personne y était AVANT d'être déclarée — et l'en retirer effacerait
   *  alors une découverte du pipeline pour une raison qui ne la concerne pas. */
  async undeclareOrgPerson(
    accountId: string,
    userId: string,
    fullName: string,
  ): Promise<Result<{ declared: number }, OnDemandFailure>> {
    const accountResult = await this.accounts.findOne(accountId, userId)
    if (isFailure(accountResult)) {
      return failure({ code: 'not_found', message: accountResult.problem.message })
    }
    if (!this.orgGraph) {
      return failure({ code: 'precondition_failed', message: "La saisie d'organigramme n'est pas disponible." })
    }
    const declared = await this.orgGraph.undeclarePerson({ accountId, fullName })
    if (declared === null) {
      return failure({ code: 'precondition_failed', message: "La déclaration n'a pas pu être retirée." })
    }
    return success({ declared })
  }

  async recomputeOrgPath(
    accountId: string,
    userId: string,
  ): Promise<Result<{ steps: number; graphVersion: number }, OnDemandFailure>> {
    const demoRefusal = await this.demoGuard(userId)
    if (demoRefusal) return failure(demoRefusal)
    const accountResult = await this.accounts.findOne(accountId, userId)
    if (isFailure(accountResult)) {
      return failure({ code: 'not_found', message: accountResult.problem.message })
    }
    if (!this.orgGraph) {
      return failure({ code: 'precondition_failed', message: "Le recalcul du chemin n'est pas disponible." })
    }

    const recomputed = await this.orgGraph.recomputePath(accountId)
    if (!recomputed) {
      // Rien de stocké à réordonner, ou aucun interlocuteur actionnable : on le
      // dit, plutôt que de renvoyer un succès qui n'a rien changé.
      return failure({
        code: 'precondition_failed',
        message:
          "Aucun chemin à recalculer : ce dossier n'a pas encore d'organigramme exploitable ou aucun interlocuteur actionnable.",
      })
    }
    return success(recomputed)
  }

  /**
   * « Vérifier une relation » (annexe organigramme p22) — la preuve d'UN lien
   * inféré, à la demande.
   *
   * Le service IA lance une recherche CIBLÉE sur les deux personnes du lien et
   * rend un verdict déterministe (aucun LLM ne prononce de hiérarchie). Trois
   * issues, toutes honnêtes :
   *   · preuve officielle → le lien passe vérifié (plein, sourcé, ≥ 90) ;
   *   · preuve secondaire → il reste pointillé, mieux étayé ;
   *   · rien trouvé → `found: false`, et le graphe n'est PAS touché : l'absence
   *     de preuve n'est pas une preuve du contraire.
   *
   * ⚠️ COÛTE 1 à 2 crédits — et ce docbloc affirmait « aucun crédit débité »
   * SOIXANTE-NEUF lignes au-dessus du `consumeAnalysisSlot` qui les débite.
   * Le débit part APRÈS la preuve : une recherche qui ne trouve rien n'est pas
   * facturée, ce qui est la bonne règle — mais elle ne se raconte pas « gratuit ».
   */
  async verifyOrgRelation(
    accountId: string,
    userId: string,
    edge: { fromId: string; toId: string; type: OrgHierarchyRelation },
  ): Promise<
    Result<
      { found: boolean; verified: boolean; confidence: number | null; graphVersion: number | null },
      OnDemandFailure
    >
  > {
    const demoRefusal = await this.demoGuard(userId)
    if (demoRefusal) return failure(demoRefusal)
    const accountResult = await this.accounts.findOne(accountId, userId)
    if (isFailure(accountResult)) {
      return failure({ code: 'not_found', message: accountResult.problem.message })
    }
    if (!this.orgGraph) {
      return failure({ code: 'precondition_failed', message: "La vérification d'un lien n'est pas disponible." })
    }

    const target = await this.orgGraph.relationToVerify(accountId, edge)
    if (!target) {
      return failure({
        code: 'precondition_failed',
        message: 'Ce lien est introuvable dans le dossier, ou il est déjà vérifié.',
      })
    }

    let envelope: Awaited<ReturnType<IaClient['verifyRelation']>>
    try {
      envelope = await this.ia.verifyRelation({
        company: target.company,
        fromName: target.fromName,
        toName: target.toName,
        website: target.website,
      })
    } catch (err) {
      this.logger.error('On-demand relation verification call failed', { error: err, accountId })
      return failure({
        code: 'ia_failed',
        message: err instanceof Error ? err.message : 'Impossible de vérifier ce lien.',
      })
    }
    const payload = (envelope?.data ?? envelope) as {
      verified?: boolean
      confidence?: number | null
      sources?: OrgSource[]
    } | null

    const confidence = typeof payload?.confidence === 'number' ? payload.confidence : null
    const sources = Array.isArray(payload?.sources) ? payload!.sources! : []
    if (confidence === null || sources.length === 0) {
      // Rien trouvé : succès de l'ACTION (la recherche a bien tourné), zéro
      // écriture. L'écran dit « aucune preuve trouvée », pas « erreur ».
      return success({ found: false, verified: false, confidence: null, graphVersion: null })
    }

    const applied = await this.orgGraph.applyRelationVerification(accountId, {
      ...edge,
      verdict: { verified: Boolean(payload?.verified), confidence, sources },
    })
    if (!applied) {
      return success({ found: false, verified: false, confidence: null, graphVersion: null })
    }

    // Le débit vient APRÈS la preuve (recette finale §9 — P1-03). La
    // vérification d'un lien coûte 1 à 2 crédits, et l'ordre compte : on ne
    // débite que quand une source a été trouvée ET appliquée au graphe. Une
    // recherche qui ne trouve rien a coûté du calcul, mais elle n'a rien
    // apporté — la facturer serait faire payer une question, pas une réponse,
    // et c'est exactement le reproche déjà corrigé sur l'enrichissement.
    //
    // Best-effort : un débit raté ne défait pas une vérification acquise. Le
    // déséquilibre penche du bon côté — on perd un crédit, jamais une preuve.
    await this.credits
      ?.consumeAnalysisSlot(userId, {
        reason: `vérification de relation : ${target.fromName} → ${target.toName}`,
        accountId,
        cost: creditCostOf('relation_verification', { perimeterUnits: sources.length }),
      })
      .catch(() => undefined)

    return success({ found: true, ...applied })
  }

  /**
   * Targeted refresh (C2): re-run ONLY Phase 1 (research) for an existing
   * account and re-persist the fresh company facts, bumping ``refreshed_at``
   * (``updated_at``). Cheaper than the full pipeline — the contacts / plan are
   * left intact; only the facts that go stale (signals, revenue, org changes)
   * are refreshed.
   *
   * Same synchronous, single-phase shape as the "Enrichir" handlers above:
   * no queue, no Socket.IO, no DLQ. Scoped by ``user_id`` via ``findOne`` so a
   * cross-tenant request can't refresh someone else's account.
   */
  async refreshResearch(
    accountId: string,
    userId: string,
    // LOT (15/10) DATA-A point 2 — `watch` : le rafraîchissement quotidien de la veille (jamais « Actualiser »).
    // LOT (15/10) DATA-C — `llmLane: 'batch'` : le refresh NOCTURNE de la veille
    // passe ses appels Claude en lot (moitié prix, repli synchrone côté IA).
    // #4687 — `internalHistory` : le rejeu CIBLÉ du segment « historique interne » (jamais un « Actualiser » ordinaire,
    // qui ne relit ni Drive ni e-mails ni ATS : coût et latence inchangés pour tout le monde).
    options: { watch?: boolean; llmLane?: 'batch'; internalHistory?: boolean } = {},
  ): Promise<Result<{ refreshed: true }, OnDemandFailure>> {
    const research = await this.runResearch(accountId, userId, options)
    if (isFailure(research)) return failure(research.problem)
    return success({ refreshed: true })
  }

  /**
   * "Rechercher les sites" button (TabSites empty state). The account's French
   * sites (``sites_france``) are produced exclusively by Phase 1 research (real
   * Pappers établissements / INSEE Sirene — never invented), so (re)discovering
   * them = re-running research and re-persisting. Reuses the exact same
   * single-phase path as ``refreshResearch``.
   *
   * Billing: like the sibling ``enrichContacts`` / ``enrichOrganigram`` buttons
   * (and unlike ``POST :accountId/refresh`` which spends an enrichment credit),
   * this does NOT debit a credit — it's a first-time populate from the empty
   * state. Returns ``{ matched, total }`` (sites with a usable location over all
   * sites found) to mirror ``enrichOrganigram``'s response shape.
   */
  async researchSites(
    accountId: string,
    userId: string,
  ): Promise<Result<{ matched: number; total: number }, OnDemandFailure>> {
    const research = await this.runResearch(accountId, userId)
    if (isFailure(research)) return failure(research.problem)

    const sites = extractSitesFrance(research.output.data)
    return success({ matched: sites.filter(siteHasLocation).length, total: sites.length })
  }

  /**
   * Shared Phase-1 re-run used by ``refreshResearch`` (returns a bare ack) and
   * ``researchSites`` (counts the discovered sites). Same synchronous,
   * single-phase shape as the other "Enrichir" handlers: no queue, no Socket.IO,
   * no DLQ, demo-guarded, and scoped by ``user_id`` via ``findOne`` so a
   * cross-tenant request can't touch someone else's account.
   */
  private async runResearch(
    accountId: string,
    userId: string,
    options: { watch?: boolean; llmLane?: 'batch'; internalHistory?: boolean } = {},
  ): Promise<Result<{ data: AnalysisResearchData | undefined }, OnDemandFailure>> {
    const demoRefusal = await this.demoGuard(userId)
    if (demoRefusal) return failure(demoRefusal)
    const accountResult = await this.accounts.findOne(accountId, userId)
    if (isFailure(accountResult)) {
      return failure({ code: 'not_found', message: accountResult.problem.message })
    }
    const account = accountResult.output

    this.logger.log('On-demand research refresh', {
      accountId,
      userId,
      companyName: account.company_name,
    })

    let response: Awaited<ReturnType<IaClient['research']>>
    try {
      response = await this.ia.research(
        {
          companyName: account.company_name,
          // Le SIREN déjà résolu du compte. Sans lui, un « Rafraîchir » repart du
          // NOM seul : pour un nom ambigu — « FRANCE TELEVISIONS » a cinq
          // homonymes au registre — la désambiguïsation ne tranche pas, et les
          // sources ancrées sur l'identité légale (dont les marchés publics
          // attribués) rendent vide sur un compte qui en a des centaines.
          siren: account.siren ?? undefined,
          profileData: (account.raw_analysis ?? {}) as Record<string, unknown>,
          userContext: account.user_context ?? undefined,
          accountId,
          userId,
          workspaceId: await this.resolveWorkspaceId(userId),
          // Couche zéro (annexe p8) : la phase 1 recalcule le `salesContext`, donc
          // sans ce relevé un simple « Actualiser » ferait retomber un compte connu
          // du CRM en « froid ». Absent sans CRM connecté → recherche inchangée.
          crmPresence: await this.resolveCrmPresence(account, userId),
          ...(options.internalHistory ? await this.resolveInternalHistory(account, userId) : {}),
          // #3753.3 — hypothèses du vendeur (fournies, non vérifiées) : clé omise sans ciblage.
          ...(await this.sellerHypothesesOf(account)),
          // Même raison pour le kanban (annexe p6) : c'est ce chemin que le
          // refresh quotidien de la watchlist emprunte, sur des comptes suivis
          // par définition — les relire « froids » serait exactement le bug.
          commercialStatus: relationStatusForRun(account.commercial_status),
          // LOT (15/10) DATA-A point 2 — les nouveautés du jour pour la veille quotidienne seulement.
          ...(options.watch ? { watchRefresh: true } : {}),
          // Axe CHEMIN (#1631.3/.4, lot 14) — voir `resolveMarketPathAxis`.
          ...(await this.resolveMarketPathAxis(account, accountId)),
          // Axe RELATION (#2298.4, lot 19/09) — voir `resolveRelationAxis`.
          ...(await this.resolveRelationAxis(account, accountId)),
          // #4070.1/.4 — faits du compte et analyse précédente, partagés par
          // `refreshResearch`/`researchSites`/`generateAttackAngle` (même appel).
          ...(await this.resolveFactsInputs(account, userId)),
        },
        // Phase-1 carries the largest prompt (~8 min budget); one attempt so a
        // slow research run isn't re-fired (and re-billed) three times.
        // LOT (15/10) DATA-C — en voie « lot », le budget s'allonge de ce que
        // le lot peut attendre avant le repli synchrone ; sinon, inchangé.
        options.llmLane
          ? { timeoutMs: PHASE_TIMEOUT_MS.research + BATCH_LANE_EXTRA_MS, maxAttempts: 1, llmLane: options.llmLane }
          : { timeoutMs: PHASE_TIMEOUT_MS.research, maxAttempts: 1 },
      )
    } catch (err) {
      this.logger.error('On-demand research call failed', { error: err, accountId })
      return failure({
        code: 'ia_failed',
        message: err instanceof Error ? err.message : "Impossible d'actualiser l'analyse.",
      })
    }

    // No data body → IA returned nothing usable; leave the existing dossier
    // untouched rather than wiping it (JAMAIS de données fictives).
    // Lot 762 P4 — mêmes garde-fous de persistance que l'analyse complète (`saveResearch`) : ni signal ni angle
    // d'un homonyme n'entre au dossier à l'actualisation non plus.
    const rawData = response.data as AnalysisResearchData | undefined
    const data = rawData ? guardResearchForPersistence(rawData) : undefined
    if (data) {
      // #2671 — `account` vient d'un `findOne(accountId, userId)` scopé par
      // user, quelques lignes plus haut : son `workspace_id` est déjà en
      // mémoire, gratuit à passer.
      await this.accounts.refreshResearch(accountId, data, account.workspace_id)
      // Historique de signal (V2 §11). Ce chemin est celui du bouton
      // « Actualiser » ET du refresh quotidien de la veille : c'est ici que le
      // blob `recent_signals` est réécrit, donc ici qu'on date une première
      // détection, qu'on compte un changement et qu'on constate une disparition.
      // Best-effort (le service avale ses erreurs) — jamais bloquant.
      await this.signalHistory?.materialize(accountId)
      // Lot 762 P4 — PARITÉ avec l'analyse : `historical_needs` est réécrit (sinon il reste périmé après
      // « Actualiser ») et les offres relues redeviennent des besoins PROPOSÉS. Même code que le worker
      // (`research-followups.ts`) ; best-effort, jamais bloquant, aucun crédit de plus (P9).
      const followDeps = { persistence: this.persistence, needProposals: this.needProposals, logger: this.logger }
      await linkCrmDealsFor({ crmRead: this.crmRead }, account.workspace_id ?? null)
      await recordNeedProposalsFor(followDeps, account.workspace_id ?? null, accountId)
      await recordHistoricalNeedsFor(followDeps, accountId)
      // #3978 — pains/enjeux/signaux reclassés par domaine : la piste existante reçoit
      // son domaine (NULL seulement). C'est ce qui donne un effet VISIBLE au rattrapage
      // ciblé du segment `signals` — `materialize()` ne tourne qu'en fin d'analyse
      // complète. Best-effort : la recherche est déjà persistée, ne pas la faire échouer.
      try {
        await this.persistence.refreshOpportunityDomains(accountId)
      } catch (cause) {
        this.logger.warn('refreshOpportunityDomains failed', { error: cause, accountId })
      }
      // SIG-B — les recruteurs nommés par les offres gardées de CE run, par la même
      // porte contacts que l'analyse complète. Best-effort, même raison qu'au-dessus.
      try {
        await this.persistence.seedJobRecruiterContacts(accountId, userId, data as unknown as Record<string, unknown>)
      } catch (cause) {
        this.logger.warn('seedJobRecruiterContacts failed', { error: cause, accountId })
      }
    }
    return success({ data })
  }

  /**
   * « Générer un angle d'attaque à la demande » (Théo TF1 p31 : « l'angle existe
   * dans le dossier, mais rien ne permet d'en redemander un »).
   *
   * Le contenu d'un angle est produit UNIQUEMENT par la phase 1 (stratégie) — il
   * n'existe pas d'endpoint IA qui frappe un angle isolément, et le prisme qui les
   * génère est hors de ce périmètre. On réutilise donc l'appel de recherche EXISTANT
   * (`ia.research`, exactement celui du bouton « Actualiser ») : il relance la
   * stratégie et remonte des angles frais (variance LLM + signaux à jour). On ne
   * jette rien de ce qui est collecté — la recherche fraîche est re-persistée comme
   * un « Actualiser » — et on ACCUMULE l'angle recommandé le plus frais dans la
   * liste d'angles du dossier (`user_attack_angles`, dédupliquée), de sorte que
   * chaque « redemande » ajoute une option sans écraser les précédentes.
   *
   * JAMAIS de donnée inventée : sans angle remonté par l'IA, on refuse proprement
   * plutôt que d'en fabriquer un. Scopé par `user_id` via `findOne`. Aucun débit de
   * crédit (comme les boutons « Enrichir »/« Actualiser »).
   */
  async generateAttackAngle(
    accountId: string,
    userId: string,
  ): Promise<Result<{ angle: UserAttackAngle; added: boolean }, OnDemandFailure>> {
    // Réutilise le chemin phase-1 partagé : demoGuard + `findOne` (scope user) +
    // appel IA + re-persistance de la recherche fraîche (rien n'est gaspillé).
    const research = await this.runResearch(accountId, userId)
    if (isFailure(research)) return failure(research.problem)

    const angles = research.output.data?.angles
    const top = Array.isArray(angles) ? angles.find(isUsableAngle) : undefined
    if (!top) {
      // L'IA n'a remonté aucun angle exploitable : on le dit, on n'en invente pas.
      return failure({
        code: 'ia_failed',
        message: "Aucun angle d'attaque n'a pu être généré pour ce compte — réessaie dans un instant.",
      })
    }

    const angle = toUserAttackAngle(top)
    const before = countUserAngles(research.output.data, angle.title)
    // Persistance dédupliquée (le SQL de `appendUserAttackAngle` ignore un doublon
    // exact) : « redemander » accumule les angles distincts sans jamais en dupliquer.
    const persisted = await this.accounts.appendUserAttackAngle(accountId, userId, angle)
    if (!persisted) {
      return failure({ code: 'not_found', message: 'Compte introuvable.' })
    }
    const after = countUserAngles(persisted.raw_analysis, angle.title)
    return success({ angle, added: after > before })
  }

  /**
   * #2298.4 (19/09/2026, lot I3) — « Recalculer la relation (gratuit) », le
   * bouton du bandeau « à revérifier » de l'onglet Accès.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * ZÉRO APPEL SORTANT — LA GARANTIE DE CE CHEMIN
   * ─────────────────────────────────────────────────────────────────────────
   * Quatre sources sont déjà en base, sans réseau : missions signées + agenda +
   * e-mails + (#4680) les contacts CONNUS rattachés au compte, import ou CRM (le NOMBRE, jamais un nom) (`resolveRelationAxis` ci-dessus, `RelationAxisReaderService`) et
   * la correction humaine (`relationship_memory.relation`, déjà chargée sur le
   * compte). `this.ia.recalculateRelationAxis` frappe `/score/addressability-relation`
   * côté IA — déterministe, sans modèle, sans crédit (même garantie que
   * `scoreAxes`). AUCUN appel à `CrmReadService` (le CRM exigerait une lecture
   * LIVE du fournisseur connecté), AUCUN appel à `ia.research`/`ia.contacts`
   * (les chemins PAYANTS). Voir `analysis-ondemand.service.recalculateRelationAxis.spec.ts`
   * pour la preuve rouge qui compte les appels sortants.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * NE DOWNGRADE JAMAIS ("on archive, on ne supprime pas")
   * ─────────────────────────────────────────────────────────────────────────
   * Si l'axe relation est DÉJÀ mesuré (par exemple via le CRM, à la dernière
   * analyse complète) et que ce recalcul gratuit ne trouve AUCUNE des trois
   * sources DB, le facteur existant est conservé TEL QUEL — jamais effacé pour
   * un « non mesuré » qui ne ferait que refléter l'angle mort de ce chemin
   * gratuit (il ne relit jamais le CRM). Une correction humaine, elle, est
   * TOUJOURS relue fraîche : elle ne peut donc jamais être écrasée par ce
   * recalcul — elle y entre à chaque appel.
   *
   * La date (`addressability_relation_collected_at`) avance à CHAQUE appel
   * réussi, même quand rien ne change : le bandeau « à revérifier » doit
   * cesser de s'afficher dès que ce chemin a été exécuté, pas seulement quand
   * il trouve quelque chose de neuf.
   */
  async recalculateRelationAxis(
    accountId: string,
    userId: string,
  ): Promise<Result<{ measured: boolean }, OnDemandFailure>> {
    const demoRefusal = await this.demoGuard(userId)
    if (demoRefusal) return failure(demoRefusal)
    const accountResult = await this.accounts.findOne(accountId, userId)
    if (isFailure(accountResult)) {
      return failure({ code: 'not_found', message: accountResult.problem.message })
    }
    const account = accountResult.output

    const relationAxis = await this.resolveRelationAxis(account, accountId)
    const recalc = await this.ia.recalculateRelationAxis({
      missionsCount: relationAxis.relationMissionsCount,
      lastMeetingAt: relationAxis.relationLastMeetingAt,
      lastEmailAt: relationAxis.relationLastEmailAt,
      knownContactsCount: relationAxis.relationKnownContactsCount,
      humanCorrection: relationAxis.relationHumanCorrection,
    })

    const raw = (account.raw_analysis ?? {}) as Record<string, unknown>
    const existing = addressabilitySchema.safeParse(raw.addressability ?? {})
    const base: Addressability = existing.success ? existing.data : { score: null, max: 0, unmeasured: [], factors: [] }
    const merged = mergeRelationAxis(base, recalc)

    await this.accounts.applyAddressabilityRelationRecalc(accountId, merged, new Date())
    return success({ measured: merged.factors.some(factor => factor.axis === 'relation') })
  }
}

/**
 * #2298.4 (19/09/2026, lot I3) — recombine le facteur relation FRAÎCHEMENT
 * recalculé avec le reste de l'adressabilité déjà stockée (lock/proportion/
 * path/access_cost, jamais touchés ici). Pure, sans I/O.
 *
 * « Ne downgrade jamais » : si le recalcul ne trouve rien (`recalc.factors`
 * vide) ET qu'un facteur relation existait déjà, la base repart INCHANGÉE —
 * voir le docblock de `recalculateRelationAxis`.
 */
function mergeRelationAxis(
  base: Addressability,
  recalc: { factors: { axis: string; label: string; points: number; evidence: string; label_key?: string }[] },
): Addressability {
  const freshRelation = recalc.factors.find(factor => factor.axis === 'relation')
  const hadRelation = base.factors.some(factor => factor.axis === 'relation')
  if (!freshRelation && hadRelation) return base

  const factorsWithoutRelation = base.factors.filter(factor => factor.axis !== 'relation')
  const factors = freshRelation ? [...factorsWithoutRelation, freshRelation] : factorsWithoutRelation
  const measuredAxes = new Set(factors.map(factor => factor.axis))
  const unmeasured = ADDRESSABILITY_AXES.map(axis => axis.key).filter(key => !measuredAxes.has(key))
  const max = ADDRESSABILITY_AXES.filter(axis => measuredAxes.has(axis.key)).reduce((sum, axis) => sum + axis.max, 0)
  const score = max > 0 ? factors.reduce((sum, factor) => sum + factor.points, 0) : null
  return { score, max, unmeasured, factors }
}

/** Un angle n'est exploitable que s'il porte au moins un titre non vide. */
function isUsableAngle(angle: unknown): angle is AnalysisAttackAngle {
  return Boolean(angle && typeof angle === 'object' && (angle as { title?: unknown }).title)
}

/** Projette l'angle de recherche (phase 1) sur la forme éditable du dossier.
 *  `strategy` porte le raisonnement, sinon `description` ; `entry_contact_persona`
 *  devient la porte d'entrée. `recommended: false` — un angle ajouté à la demande
 *  ne détrône pas l'angle n°1 du dossier. */
function toUserAttackAngle(angle: AnalysisAttackAngle): UserAttackAngle {
  const title = String(angle.title).trim()
  const description = (angle.strategy || angle.description || '').trim() || null
  const entryPoint = (angle.entry_contact_persona || '').trim() || null
  return { title, description, entry_point: entryPoint, offer: null, estimated_deal_size: null, recommended: false }
}

/** Combien de fois ce titre d'angle figure déjà dans `user_attack_angles` — sert
 *  à distinguer un ajout réel d'un doublon ignoré par la persistance. */
function countUserAngles(raw: Record<string, unknown> | null | undefined, title: string): number {
  const list = (raw as { user_attack_angles?: unknown } | null | undefined)?.user_attack_angles
  if (!Array.isArray(list)) return 0
  const needle = title.trim().toLowerCase()
  return list.filter(
    a =>
      String((a as { title?: unknown })?.title ?? '')
        .trim()
        .toLowerCase() === needle,
  ).length
}

const ORG_ANCHOR_SOURCES = ['enrichment', 'website', 'explicit', 'none'] as const

function parseOrgAnchorSource(raw: unknown): (typeof ORG_ANCHOR_SOURCES)[number] | undefined {
  return ORG_ANCHOR_SOURCES.find(source => source === raw)
}

/** C.2 (Cédric 20/10) — ancres d'organisation Apollo posées par le run complet dans
 *  `raw_analysis.apolloEnrichment`. Absentes = objet vide (champs omis, jamais inventés). */
function readOrgAnchor(rawAnalysis: unknown): { organizationIds?: string[]; organizationDomains?: string[] } {
  const enrichment = (rawAnalysis as { apolloEnrichment?: Record<string, unknown> } | null | undefined)
    ?.apolloEnrichment
  const clean = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')
  const id = clean(enrichment?.organizationId)
  const domain = clean(enrichment?.domain) || clean(enrichment?.primary_domain)
  return {
    ...(id ? { organizationIds: [id] } : {}),
    ...(domain ? { organizationDomains: [domain] } : {}),
  }
}

/**
 * #2532.2 bis — lit `themeSearch` sur la réponse IA de `enrichContacts`,
 * défensivement (c'est du JSON externe non typé côté TS). `undefined` quand
 * la clé est absente (recherche non thématisée) OU quand sa forme ne tient
 * pas la route — jamais une valeur devinée à sa place.
 */
function parseThemeSearchResult(raw: unknown): EnrichThemeSearchResult | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  if (typeof r.theme !== 'string' || !r.theme) return undefined
  const titles = Array.isArray(r.titles) ? r.titles.filter((t): t is string => typeof t === 'string') : []
  const matchedNames = Array.isArray(r.matchedNames)
    ? r.matchedNames.filter((n): n is string => typeof n === 'string')
    : []
  return {
    theme: r.theme,
    titles,
    matchedCount: typeof r.matchedCount === 'number' ? r.matchedCount : 0,
    matchedNames,
    outOfThemeCount: typeof r.outOfThemeCount === 'number' ? r.outOfThemeCount : 0,
    // Absence/forme invalide ⇒ `false` (honnête) : on ne prétend JAMAIS
    // qu'un preset a matché sans preuve — cf. doctrine « non mesuré n'est
    // jamais 0 » appliquée ici à l'inverse (jamais un `true` inventé).
    presetMatched: r.presetMatched === true,
  }
}

/** Read the ``sitesFrance`` array off a Phase-1 research payload (camelCase on
 *  the wire; not enumerated on ``AnalysisResearchData`` so we read it as a bag).
 *  Non-array / missing → empty; keeps object entries only. */
function extractSitesFrance(data: AnalysisResearchData | undefined): Array<Record<string, unknown>> {
  const raw = (data as Record<string, unknown> | undefined)?.['sitesFrance']
  if (!Array.isArray(raw)) return []
  return raw.filter((site): site is Record<string, unknown> => site != null && typeof site === 'object')
}

/** A site is "located" (map-plottable) when it carries a non-empty city or
 *  region — the two fields the SitesFrance view groups on. */
function siteHasLocation(site: Record<string, unknown>): boolean {
  const city = site['city']
  const region = site['region']
  return (
    (typeof city === 'string' && city.trim().length > 0) || (typeof region === 'string' && region.trim().length > 0)
  )
}
