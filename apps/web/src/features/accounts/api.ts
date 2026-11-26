import type {
  AccountIntelligenceContextView,
  CrmMirrorAccountView,
  ConflictedField,
  AccountStrategy5P,
  AccountInterestPenetrability,
  AccountVariationSignal,
  AccountInterestPenetrabilityPortfolio,
  Account,
  BetProfileRow,
  CommitteeEntryLevel,
  SetBetProfileRequest,
  SetCommitteeEntryLevelRequest,
  ActiveAnalysisRun,
  AccountBillingProfilesResponse,
  AccountCostSummary,
  AccountFavoriteState,
  AccountChanges,
  AccountKnownMovements,
  ConsultantSectorKnowledgeList,
  BackgroundJobAccepted,
  BackgroundJobStatus,
  AccountListQuery,
  AccountListResponse,
  AccountMarketContext,
  AccountMarketPaths,
  AccountRegistryAnnouncements,
  AccountJobOffers,
  AccountRecentHires,
  AccountNeedsRow,
  AccountPlanMutationResponse,
  AccountSignalItem,
  AnalysisRun,
  AnalysisVocabularyTerm,
  CommercialLifecycle,
  CommercialOutcome,
  ContactDiscoveryRunRequest,
  ContactDiscoveryOutcome,
  ContactDiscoveryQuote,
  ContactScope,
  CreateCommercialOutcomeInput,
  CoverageGapsResponse,
  AccountProfileProvenance,
  DeclareAccountSignalsRequest,
  DeclareOrgPeopleRequest,
  DeclareOrgPeopleResponse,
  OrgImportPreviewResponse,
  OrgEnrichmentPlanEstimate,
  OrgEnrichmentPlanRequest,
  OrgEnrichmentWaveResult,
  OrgHierarchyRelation,
  PaginatedResult,
  RefreshDimension,
  RefreshDiff,
  RecentSignal,
  DeepenQuote,
  DeepenTarget,
  RelationshipMemory,
  SimilarAccountSuggestion,
  StrategyScope,
  Task,
  UserAttackAngle,
  VerdictRevision,
  VerdictUnchanged,
} from '@bellum/contracts'
import { asList, type CrmFusionReport } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import { ApiError } from '@/lib/api-error'
import { i18n } from '@/i18n'
import type { BattlecardData, CompareData } from './battlecard-compare.types'

/** #4498.a — un axe coché à plusieurs : une valeur répétée par choix (`?sector=a&sector=b`), jamais « Tous ». */
function appendAll(params: URLSearchParams, key: string, raw: string | readonly string[] | undefined): void {
  for (const value of asList(raw)) if (value !== 'all') params.append(key, value)
}

/**
 * LES FILTRES DE LA LISTE, ÉCRITS DANS L'URL — UNE LISTE BLANCHE, ET C'EST SON
 * DANGER.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI EST ARRIVÉ DEUX FOIS, ET CE QUI LE GARDE MAINTENANT
 * ─────────────────────────────────────────────────────────────────────────────
 * Ajouter un filtre au contrat, l'accepter côté serveur, le poser dans l'URL de
 * l'écran et le passer à `useAccounts` ne suffit PAS : tant que son nom n'est
 * pas écrit ICI, la requête part sans lui. Rien ne rougit — la clé de cache
 * change (elle porte l'objet `filters` entier), donc React Query REFAIT bien
 * l'appel, mais vers la MÊME URL. L'écran rend alors la liste non filtrée sous
 * un libellé qui promet un filtre.
 *
 * C'est arrivé deux fois, et la seconde a été trouvée en cherchant le jumeau de
 * la première :
 *   · `entityKind` (« Type d'organisation », 31/08/2026) — accepté par le
 *     serveur, posé dans l'URL de l'écran, jamais envoyé. Mesuré en production
 *     le 08/09 : `?entityKind=subsidiary` rend 1 compte sur 6 côté API, et
 *     l'écran en montrait 6 ;
 *   · `marketCovered` (#1575.1, le cinquième compteur) — même chose, trouvé à
 *     la recette live du lot qui l'introduisait.
 *
 * `accounts.filter-serialisation.test.ts` interdit la troisième : il compare
 * les clés d'`accountListQuerySchema` à ce que cette fonction sait écrire.
 *
 * ⚠️ `'all'` n'est PAS une valeur à envoyer : c'est l'idiome du dépôt pour
 * « pas de filtre » (`status`, `lifecycle`, `gate`, `marketCovered`). L'écrire
 * ferait porter au serveur un axe que personne n'a demandé.
 */
export function buildQueryString(filters: AccountListQuery): string {
  const params = new URLSearchParams()
  if (filters.q) params.set('q', filters.q)
  // #4498.a — chaque axe se coche à plusieurs : une valeur répétée par choix (`?sector=a&sector=b`).
  appendAll(params, 'status', filters.status)
  appendAll(params, 'lifecycle', filters.lifecycle)
  if (filters.sort) params.set('sort', filters.sort)
  appendAll(params, 'sector', filters.sector)
  // #2159.26 — l'étiquette, normalisée côté serveur.
  appendAll(params, 'tag', filters.tag)
  appendAll(params, 'score', filters.score)
  appendAll(params, 'gate', filters.gate)
  // Le « Type d'organisation » (31/08/2026). Absent d'ici jusqu'au 08/09 : le
  // filtre existait des deux côtés et ne traversait pas.
  appendAll(params, 'entityKind', filters.entityKind)
  // #4498.c — Historique documenté, Références autorisées.
  if (filters.documentedHistory && filters.documentedHistory !== 'all')
    params.set('documentedHistory', filters.documentedHistory)
  if (filters.authorizedReferences && filters.authorizedReferences !== 'all')
    params.set('authorizedReferences', filters.authorizedReferences)
  // #4526.2 — « Mon CRM ». `'all'` ≡ pas de filtre.
  if (filters.crm && filters.crm !== 'all') params.set('crm', filters.crm)
  // #4597.1 — « Importés ». `'all'` ≡ pas de filtre. #4597.3 — les comptes de CET import (identifiant du job).
  if (filters.imported && filters.imported !== 'all') params.set('imported', filters.imported)
  if (filters.importJob) params.set('importJob', filters.importJob)
  // #1580 — le clic sur une métrique décisionnelle du bandeau de tête.
  if (filters.headline) params.set('headline', filters.headline)
  // #1575.1 — le clic sur le cinquième compteur, « avec des parcours observés ».
  if (filters.marketCovered && filters.marketCovered !== 'all') params.set('marketCovered', filters.marketCovered)
  // #2150.13 — la vue « À actualiser ». Sans cette ligne la liste blanche l'avalerait :
  // posé dans l'URL, passé au hook, jamais envoyé.
  if (filters.freshness && filters.freshness !== 'all') params.set('freshness', filters.freshness)
  // #2150.14/.18 — « Mes favoris », rétabli. `'all'` ≡ pas de filtre, même idiome.
  if (filters.favorite && filters.favorite !== 'all') params.set('favorite', filters.favorite)
  // #2150.15 — « Portés par un collègue ». Jamais envoyé EN MÊME TEMPS que
  // `favorite` par l'écran (les deux bascules s'excluent), mais rien ici ne le
  // suppose : la liste blanche écrit ce qu'on lui donne.
  if (filters.ownership && filters.ownership !== 'all') params.set('ownership', filters.ownership)
  // #3184.1 — usage interne (copilot-bridge), traverse comme tout filtre déclaré.
  if (filters.reusableOnly) params.set('reusableOnly', String(filters.reusableOnly))
  if (filters.offset !== undefined) params.set('offset', String(filters.offset))
  if (filters.limit !== undefined) params.set('limit', String(filters.limit))
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

/** Un plan d'attaque de besoin, tel que l'API le rend (table `need_plays`). */
/** #3918.2 (r40) — ce que le CRM dit d'UN compte : ses signaux, et de quoi expliquer qu'il n'y en ait aucun. */
type AccountCrmSignals = { items: RecentSignal[]; crmConnected: boolean; linkedDeals: number | null }

export type NeedPlayRow = {
  id: string
  account_id: string
  need_label: string
  generated_at: string
  content: {
    angle: string
    targets: { name: string; role: string; why: string }[]
    message: string
    proofs: { claim: string; proof: string }[]
    missing: string[]
    next_action: string
  }
}

/** Où en est la reconstruction du graphe d'organigramme lancée derrière une
 *  recherche ciblée. `idle` = aucune reconstruction connue — ce n'est pas un
 *  échec, c'est « rien en cours ». */
type OrgRebuildState = 'idle' | 'queued' | 'active' | 'completed' | 'failed'

/**
 * Les contrôles de qualité, RENDUS COMPTE PAR COMPTE (`GET /accounts/hygiene`).
 *
 * ⚠️ `null` n'est PAS une liste vide : une liste vide se lit « tout est propre »
 * et une lecture qui a échoué doit se lire « je n'ai pas pu regarder ». Les deux
 * lectures échouent — et se bornent — séparément.
 */
export type AccountHygieneByAccount = {
  /** Les comptes suivis sur lesquels rien n'est programmé. */
  withoutNextAction: { ids: string[]; truncated: boolean } | null
  /** Par compte, ses contacts sans adresse et sur combien. Seuls les comptes qui
   *  en portent au moins un y figurent. */
  contactsWithoutEmail: { byAccount: Record<string, { count: number; total: number }>; truncated: boolean } | null
}

export type EnrichContactsResult = {
  count: number
  identified?: number
  organigramRebuild?: 'skipped' | 'queued' | 'unavailable'
  /** C.2 (Cédric 20/10) — d'où vient l'ancre d'organisation de la recherche ;
   *  `none` = limitée au nom de l'entreprise. Absent = non mesuré. */
  orgAnchorSource?: 'enrichment' | 'website' | 'explicit' | 'none'
  /** #2532.2 bis — le RÉSULTAT d'une recherche CIBLÉE PAR THÈME, tel que l'IA
   *  l'a mesuré : `matchedNames` sont les contacts qui portent RÉELLEMENT le
   *  thème, `outOfThemeCount` ceux entrés par cette recherche mais SANS
   *  rapport avec lui (comptés à part, jamais attribués). Absent sur une
   *  recherche non thématisée — non mesuré, jamais un 0 inventé (GA-18/19).
   *  `presetMatched` (#2532.2, 21/09/2026) : le thème a-t-il reconnu une des
   *  10 familles de `contact_themes.py` ? `false` = retombé sur le mot-clé
   *  brut + sa variante de genre — l'écran DOIT le nommer (jamais un
   *  silence qui laisse croire à une expansion sectorielle). */
  themeSearch?: {
    theme: string
    titles: string[]
    matchedCount: number
    matchedNames: string[]
    outOfThemeCount: number
    presetMatched: boolean
  }
}

/** Rythme du suivi de la re-planification (#1092). 2 s est assez fin pour que
 *  l'attente reste vivante sans faire 90 requêtes ; le plafond couvre le budget
 *  serveur de la phase 4 (300 s) avec de la marge, sans laisser un bouton filer
 *  indéfiniment si un worker meurt en route. */
const REPLAN_POLL_INTERVAL_MS = 2_000
const REPLAN_POLL_MAX_MS = 360_000

const waitMs = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Suit le calcul jusqu'à son terme.
 *
 * `unknown` (plus aucune trace du job) et l'expiration du suivi ne sont PAS des
 * échecs : le plan a peut-être été enregistré. On les rend en 504, que l'écran
 * traduit par « on n'a pas eu la réponse — regarde si le plan a changé avant de
 * relancer », jamais par « ça a échoué » — qui pousserait à repayer un calcul
 * peut-être déjà fait.
 */
async function pollReplan(accountId: string): Promise<{ replanned: true }> {
  const deadline = Date.now() + REPLAN_POLL_MAX_MS
  for (;;) {
    const status = await apiFetch<BackgroundJobStatus<{ replanned: true }>>({
      path: `/analysis/${accountId}/replan`,
    })
    if (status.state === 'done') return status.result
    if (status.state !== 'queued' && status.state !== 'running') {
      throw new ApiError(i18n.t('accountDetail:replan.timeoutTitle'), 504, 'upstream_error')
    }
    if (Date.now() >= deadline) {
      throw new ApiError(i18n.t('accountDetail:replan.timeoutTitle'), 504, 'upstream_error')
    }
    await waitMs(REPLAN_POLL_INTERVAL_MS)
  }
}

/** Ce que le rattachement d'un doublon fera — rendu avant ET après l'écriture. */
type AbsorbPreview = {
  absorbedName: string
  keptName: string
  movedContacts: number
  keptContacts: Array<{ id: string; fullName: string; reason: 'already_there' }>
  entityName: string
}

/** Ce que le détachement fera — rendu avant ET après l'écriture. */
export type DetachPreview = {
  detachedName: string
  keptName: string
  returnedContacts: number
  keptContacts: Array<{ id: string; fullName: string; reason: 'name_taken' }>
}

/**
 * Un dossier du MÊME GROUPE, vu depuis l'un des deux bouts du lien (#1111).
 *
 * `linkedAt` vaut `null` sur les liens posés avant que la provenance soit
 * enregistrée : la date est INCONNUE, et l'écran doit le dire au lieu
 * d'afficher celle du jour.
 */
export type LinkedAccount = {
  id: string
  companyName: string
  status: string
  linkedAt: string | null
}

/**
 * #2306.24 — même réponse que `accounts.controller.ts::listImpactedByProfileChange`.
 * `currentEsnProfileVersion: null` = lecteur de profil absent ou lecture en
 * échec, `accounts` vide dans ce cas plutôt qu'une comparaison inventée.
 */
export type ImpactedAccountsResponse = {
  currentEsnProfileVersion: number | null
  accounts: { accountId: string; companyName: string; esnProfileVersion: number }[]
}

/**
 * #2091.31 — même réponse que `accounts.controller.ts::hasAccountsToAct`.
 * Un seul consommateur (`/welcome`) : pas de type partagé côté `@bellum/contracts`.
 */
export type HasAccountsToActResponse = { hasAccountsToAct: boolean }

/**
 * Les deux sens du lien pour un compte, plus ce que le détachement autorise.
 *
 * `detachRefusal` est calculé par le serveur : la règle du retour arrière vit à
 * UN seul endroit, sinon les deux chemins divergent au premier ajustement.
 */
/** #4158.60-.62 — une entité du même groupe (une fiche par entité, son responsable, ses compteurs). */
export type GroupEntity = {
  id: string
  companyName: string
  role: 'groupe' | 'filiale' | null
  ownerUserId: string | null
  openActions: number
  notes: number
}

export type AccountLinks = {
  mergedInto: LinkedAccount | null
  linked: LinkedAccount[]
  detachRefusal: 'not_linked' | 'link_predates_reversal' | null
  detachRefusalMessage: string | null
}

/** #4742 — forme de `GET /accounts/:id/tech-structure` (`account-tech-structure.ts`, côté API). */
type TechAxis = 'crm' | 'erp' | 'data' | 'hosting' | 'business'
export type TechProof = {
  kind: 'job_offer' | 'analysis'
  observed_at: string | null
  url: string | null
  label: string | null
}
export type AccountTechStructure = {
  axes: {
    axis: TechAxis
    status: 'observed' | 'not_observed'
    technologies: { name: string; proofs: TechProof[] }[]
  }[]
  observed_axes: TechAxis[]
  not_observed_axes: TechAxis[]
}

export const accountsApi = {
  list(filters: AccountListQuery = {}): Promise<AccountListResponse> {
    return apiFetch<AccountListResponse>({
      path: `/accounts${buildQueryString(filters)}`,
    })
  },
  listSignals(): Promise<AccountSignalItem[]> {
    return apiFetch<AccountSignalItem[]>({ path: '/accounts/signals' })
  },
  /**
   * LES DOSSIERS DE FACTURATION DE TOUT L'ESPACE (26/08/2026).
   *
   * Une lecture pour toute la page, jamais une par ligne : le portefeuille
   * affiche vingt-cinq comptes et défile à l'infini.
   *
   * ⚠️ Deux segments après `accounts` — la route est `entities/billing-profiles`
   * et non `billing-profiles` : à un seul segment, elle serait capturée par le
   * `@Get(':id')` d'un AUTRE contrôleur monté sur le même préfixe, et le défaut
   * ne se verrait qu'en production.
   */
  listBillingProfiles(): Promise<AccountBillingProfilesResponse> {
    return apiFetch<AccountBillingProfilesResponse>({ path: '/accounts/entities/billing-profiles' })
  },
  /** Besoins du portefeuille — une ligne par compte porteur d'un besoin. */
  listNeeds(): Promise<AccountNeedsRow[]> {
    return apiFetch<AccountNeedsRow[]>({ path: '/accounts/needs' })
  },
  /** Les plans d'attaque déjà payés par l'ÉQUIPE — lecture gratuite. */
  listNeedPlays(): Promise<NeedPlayRow[]> {
    return apiFetch<NeedPlayRow[]>({ path: '/accounts/needs/plays' })
  },
  /** Prépare l'attaque d'un besoin — 1 crédit, une seule fois pour l'équipe.
   *  `charged: false` = le plan existait déjà, rien n'a été débité. */
  createNeedPlay(body: {
    account_id: string
    kind: string
    label: string
    detail?: string | null
    offer?: string | null
    urgency?: string | null
  }): Promise<{ play: NeedPlayRow; charged: boolean }> {
    return apiFetch<{ play: NeedPlayRow; charged: boolean }>({
      path: '/accounts/needs/play',
      method: 'POST',
      body,
    })
  },
  getOne(id: string): Promise<Account> {
    return apiFetch<Account>({ path: `/accounts/${id}` })
  },
  create(company_name: string, user_context?: string | null): Promise<Account> {
    return apiFetch<Account, { company_name: string; user_context?: string | null }>({
      path: '/accounts',
      method: 'POST',
      body: { company_name, user_context },
    })
  },
  delete(id: string): Promise<{ deleted: true }> {
    return apiFetch<{ deleted: true }>({ path: `/accounts/${id}`, method: 'DELETE' })
  },
  /**
   * #4603.4 — le rattrapage des paires compte-CRM ↔ compte-analyse déjà créées. `dryRun: true` = simulation comptée,
   * rien d'écrit (le défaut côté serveur). Réservé à `integrations:manage` : un autre rôle reçoit un 403.
   */
  crmFusionSweep(dryRun: boolean): Promise<CrmFusionReport> {
    return apiFetch<CrmFusionReport, { dryRun: boolean }>({
      path: '/accounts/crm-fusions/sweep',
      method: 'POST',
      body: { dryRun },
    })
  },
  archive(id: string): Promise<{ archived: true }> {
    return apiFetch<{ archived: true }>({ path: `/accounts/${id}/archive`, method: 'POST' })
  },
  setCommercialStatus(
    id: string,
    status: CommercialLifecycle,
    reason?: string,
  ): Promise<{ id: string; commercial_status: CommercialLifecycle }> {
    return apiFetch<
      { id: string; commercial_status: CommercialLifecycle },
      { status: CommercialLifecycle; reason?: string }
    >({
      path: `/accounts/${id}/commercial-status`,
      method: 'PATCH',
      // #2117.23 — le motif ne voyage que s'il existe : jamais une chaîne vide.
      body: reason?.trim() ? { status, reason: reason.trim() } : { status },
    })
  },
  /** #3245 (#3209.6) — le profil de pari déclaré ; `null` partout = rien déclaré. */
  /** #3245 — les profils de pari DÉCLARÉS de tous les dossiers (Réglages › Charge commerciale). */
  listBetProfiles(): Promise<BetProfileRow[]> {
    return apiFetch<BetProfileRow[]>({ path: '/accounts/bet-profiles' })
  },
  getBetProfile(id: string): Promise<Required<SetBetProfileRequest>> {
    return apiFetch<Required<SetBetProfileRequest>>({ path: `/accounts/${id}/bet-profile` })
  },
  /** #3282 / #3263.30 — le niveau d'entrée du comité d'achat, saisi (liste fermée). */
  getCommitteeEntryLevel(id: string): Promise<{ level: CommitteeEntryLevel | null }> {
    return apiFetch<{ level: CommitteeEntryLevel | null }>({ path: `/accounts/${id}/committee-entry-level` })
  },
  setCommitteeEntryLevel(
    id: string,
    level: CommitteeEntryLevel | null,
  ): Promise<{ id: string; level: CommitteeEntryLevel | null }> {
    return apiFetch<{ id: string; level: CommitteeEntryLevel | null }, SetCommitteeEntryLevelRequest>({
      path: `/accounts/${id}/committee-entry-level`,
      method: 'PATCH',
      body: { level },
    })
  },
  setBetProfile(id: string, profile: SetBetProfileRequest): Promise<{ id: string } & SetBetProfileRequest> {
    return apiFetch<{ id: string } & SetBetProfileRequest, SetBetProfileRequest>({
      path: `/accounts/${id}/bet-profile`,
      method: 'PATCH',
      body: profile,
    })
  },
  /**
   * #2165.13 — marquer/démarquer ce compte comme la meilleure référence, la
   * SOURCE du preset Découvrir « Proches de mes meilleures références ».
   */
  setBestReference(id: string, value: boolean): Promise<{ id: string; is_best_reference: boolean }> {
    return apiFetch<{ id: string; is_best_reference: boolean }, { value: boolean }>({
      path: `/accounts/${id}/best-reference`,
      method: 'PATCH',
      body: { value },
    })
  },
  /**
   * #2165.13 — les comptes marqués, avec leur secteur BRUT (pas encore
   * normalisé) : le normaliseur (`matchApplicationSectors`) est le MÊME que
   * lit déjà l'ICP, pas un second qui divergerait.
   */
  fetchBestReferences(): Promise<{ id: string; name: string; sector: string | null }[]> {
    return apiFetch<{ id: string; name: string; sector: string | null }[]>({ path: '/accounts/best-references' })
  },
  /** Mémoire de relation — bloc « Mémoire » de la couche zéro (annexe méthodo p8). */
  setRelationshipMemory(
    id: string,
    memory: RelationshipMemory,
  ): Promise<{ id: string; relationship_memory: RelationshipMemory | null }> {
    return apiFetch<{ id: string; relationship_memory: RelationshipMemory | null }, RelationshipMemory>({
      path: `/accounts/${id}/relationship-memory`,
      method: 'PATCH',
      body: memory,
    })
  },
  /**
   * #2150.14/.18 — L'ÉTOILE DE LIGNE, RÉTABLIE. `POST` pose le favori,
   * `DELETE` le retire — le couple `(id, is_favorite)` voyage ensemble
   * (`accountFavoriteStateSchema`) pour qu'un cache qui reçoit la réponse
   * n'ait pas à se souvenir de ce qu'il vient d'envoyer.
   */
  setFavorite(id: string, on: boolean): Promise<AccountFavoriteState> {
    return apiFetch<AccountFavoriteState>({
      path: `/accounts/${id}/favorite`,
      method: on ? 'POST' : 'DELETE',
    })
  },
  /**
   * #2126.47/.48/.50/.51/.53/.54/.55/.60 (épopée #2787) — le ledger APPEND-ONLY
   * des outcomes commerciaux. `GET` lit ; `POST` ajoute — aucune mise à jour ni
   * suppression n'existe côté serveur (#2126.60).
   */
  listOutcomes(id: string): Promise<{ items: CommercialOutcome[] }> {
    return apiFetch<{ items: CommercialOutcome[] }>({ path: `/accounts/${id}/outcomes` })
  },
  recordOutcome(id: string, input: CreateCommercialOutcomeInput): Promise<CommercialOutcome> {
    return apiFetch<CommercialOutcome, CreateCommercialOutcomeInput>({
      path: `/accounts/${id}/outcomes`,
      method: 'POST',
      body: input,
    })
  },
  /**
   * #2128.13 (épopée #2788) — « demander validation manager ». Pose une tâche
   * sur chaque membre habilité (`team:manage`) — voir
   * `TasksService.requestManagerValidation`. Rend la liste, VIDE si personne
   * d'autre n'est habilité dans cet espace (jamais une tâche pour soi-même).
   */
  requestManagerValidation(id: string, note?: string): Promise<{ items: Task[] }> {
    return apiFetch<{ items: Task[] }, { note?: string }>({
      path: `/accounts/${id}/request-validation`,
      method: 'POST',
      body: { note },
    })
  },
  // #2123.46 — `addPlanAction` (`POST /accounts/:id/plan/actions`) est retirée :
  // une action du plan s'écrit par `planItemsApi.create` (`POST /plan-items`).
  addAttackAngle(id: string, angle: UserAttackAngle): Promise<AccountPlanMutationResponse> {
    return apiFetch<AccountPlanMutationResponse, UserAttackAngle>({
      path: `/accounts/${id}/plan/angles`,
      method: 'POST',
      body: angle,
    })
  },
  /** Re-run Phase 2 (contact discovery) on an account. Synchronous from the
   *  caller's POV — the API blocks until the IA finishes.
   *
   *  `scope` narrows the re-run to ONE angle (a BU/filiale via `entity`, a
   *  persona/techno via `theme`, a seniority band…) WITHOUT redoing the whole
   *  analysis — the server merges the new hits into the existing stock (dedupe
   *  by name, never overwrite). Omit it for a wide "extend the search" pass.
   *  Théo restitution P0-03 : « largeur puis qualification — étendre par entité,
   *  persona ou technologie ». */
  /** `count` = contacts RÉELLEMENT entrés au dossier, `identified` = ce que la
   *  recherche a trouvé (un contact déjà connu est fusionné, pas recréé), et
   *  `organigramRebuild` dit si la carte d'influence se reconstruit derrière :
   *  `queued` (en cours, à suivre), `skipped` (rien de neuf à y placer) ou
   *  `unavailable` (on n'a pas pu s'en charger — les contacts sont là, la carte
   *  attendra un « Enrichir l'organigramme »). */
  enrichContacts(accountId: string, scope?: ContactScope): Promise<EnrichContactsResult> {
    const hasAngle = scope != null && Object.values(scope).some(v => (Array.isArray(v) ? v.length > 0 : Boolean(v)))
    return apiFetch<EnrichContactsResult>({
      path: `/analysis/${accountId}/enrich-contacts`,
      method: 'POST',
      body: hasAngle ? { scope } : undefined,
    })
  },
  /** Où en est la reconstruction du graphe lancée derrière une recherche ciblée.
   *  Suivi côté client parce que la reconstruction ne tient pas dans la requête
   *  du bouton : sans ce suivi, elle se terminerait sans que rien ne bouge. */
  orgRebuildState(accountId: string): Promise<{ state: OrgRebuildState }> {
    return apiFetch<{ state: OrgRebuildState }>({ path: `/analysis/${accountId}/organigram-rebuild` })
  },
  /**
   * Re-plan a completed dossier around a chosen angle / entry mode / entity,
   *  reusing the stored research + contacts (no full re-analysis).
   *
   * #1092 — l'API rend la main (202) et le calcul tourne en fond ; on le SUIT.
   * Il durait une à deux minutes en appel synchrone, contre 120 s tolérées par
   * la passerelle : mesuré en production, un `502` à 120 176 ms sur un calcul
   * qui avait pourtant abouti. Aucun crédit débité ; un 409 signale un dossier
   * pas encore terminé / sans contact, et il tombe AVANT la mise en file.
   */
  async replan(accountId: string, strategy?: StrategyScope): Promise<{ replanned: true }> {
    await apiFetch<BackgroundJobAccepted, { strategy?: StrategyScope }>({
      path: `/analysis/${accountId}/replan`,
      method: 'POST',
      body: { strategy },
    })
    return pollReplan(accountId)
  },
  /** Re-run Phase 3 (organigram + role/email enrichment) over existing
   *  contacts. `orgGraphUpdated` (#2755) — false when the IA classified
   *  contacts but assembled no graph this run (silent no-op server-side). */
  enrichOrganigram(accountId: string): Promise<{ matched: number; total: number; orgGraphUpdated: boolean }> {
    return apiFetch<{ matched: number; total: number; orgGraphUpdated: boolean }>({
      path: `/analysis/${accountId}/enrich-organigram`,
      method: 'POST',
    })
  },

  /** « Générer un angle d'attaque à la demande » (Théo TF1 p31) — relance la
   *  stratégie (phase 1) et ACCUMULE l'angle recommandé le plus frais dans les
   *  angles du dossier, sans écraser les précédents. Synchrone, aucun crédit
   *  débité. `added` distingue un ajout réel d'un doublon déjà présent. */
  /** « Ajouter à mon portefeuille » depuis Découvrir (D6) : crée le compte s'il
   *  n'existe pas et l'ATTRIBUE au commercial. Aucun crédit — seule l'analyse
   *  en consomme. `created: false` = le compte existait déjà, il a été
   *  réattribué (jamais dupliqué). */
  addToPortfolio(input: {
    company_name: string
    siren?: string
    sector?: string
    website?: string
  }): Promise<{ id: string; company_name: string; siren: string | null; created: boolean }> {
    return apiFetch({ path: '/accounts/portfolio', method: 'POST', body: input })
  },

  /** Retirer un compte de son portefeuille, par le SIREN du candidat. */
  removeFromPortfolio(siren: string): Promise<{ removed: boolean }> {
    return apiFetch({ path: `/accounts/portfolio/${encodeURIComponent(siren)}`, method: 'DELETE' })
  },

  generateAngle(accountId: string): Promise<{ angle: UserAttackAngle; added: boolean }> {
    return apiFetch<{ angle: UserAttackAngle; added: boolean }>({
      path: `/analysis/${accountId}/generate-angle`,
      method: 'POST',
    })
  },

  /** « Recalculer le chemin » — réordonne la séquence d'approche depuis
   *  l'organigramme déjà stocké. Recalcul déterministe côté API : aucune
   *  recherche relancée, aucun crédit, réponse immédiate. */
  recomputeOrgPath(accountId: string): Promise<{ steps: number; graphVersion: number }> {
    return apiFetch<{ steps: number; graphVersion: number }>({
      path: `/analysis/${accountId}/recompute-path`,
      method: 'POST',
    })
  },

  /** « Vérifier une relation » (annexe organigramme p22) — cherche la preuve d'UN
   *  lien inféré. `found: false` = aucune preuve trouvée : le lien reste tel quel
   *  (l'absence de preuve n'est pas une preuve du contraire). Aucun crédit. */
  verifyOrgRelation(
    accountId: string,
    edge: { fromId: string; toId: string; type: OrgHierarchyRelation },
  ): Promise<{ found: boolean; verified: boolean; confidence: number | null; graphVersion: number | null }> {
    return apiFetch<
      { found: boolean; verified: boolean; confidence: number | null; graphVersion: number | null },
      typeof edge
    >({
      path: `/analysis/${accountId}/verify-relation`,
      method: 'POST',
      body: edge,
    })
  },

  /**
   * Déclarer des personnes qu'on connaît et que Bellum n'a pas trouvées (#1103).
   *
   * Les trois portes de l'écran — formulaire, fichier, texte structuré par
   * Laura — passent TOUTES par ici. Une seule écriture, donc aucun moyen que
   * deux portes divergent. Aucun crédit.
   */
  declareOrgPeople(
    accountId: string,
    people: DeclareOrgPeopleRequest['people'],
    options: { createContacts?: boolean } = {},
  ): Promise<DeclareOrgPeopleResponse> {
    return apiFetch<DeclareOrgPeopleResponse, DeclareOrgPeopleRequest>({
      path: `/analysis/${accountId}/org-people`,
      method: 'POST',
      body: { people, ...(options.createContacts ? { createContacts: true } : {}) },
    })
  },

  /**
   * #3740.1 — aperçu d'un organigramme importé : ce que Bellum sait déjà de
   * chaque personne. N'écrit rien, aucun crédit.
   */
  previewOrgPeople(accountId: string, people: DeclareOrgPeopleRequest['people']): Promise<OrgImportPreviewResponse> {
    return apiFetch<OrgImportPreviewResponse, DeclareOrgPeopleRequest>({
      path: `/analysis/${accountId}/org-people/preview`,
      method: 'POST',
      body: { people },
    })
  },

  /** Retirer une déclaration (#1103). */
  undeclareOrgPerson(accountId: string, fullName: string): Promise<{ declared: number }> {
    return apiFetch<{ declared: number }, { fullName: string }>({
      path: `/analysis/${accountId}/org-people/remove`,
      method: 'POST',
      body: { fullName },
    })
  },

  /**
   * #2634.1 — « Ajouter un signal depuis LinkedIn ». Le serveur ne contacte
   * JAMAIS LinkedIn : ce corps porte ce que le commercial a lui-même copié
   * (URL et/ou texte), voir `DeclareLinkedInSignalDialog`.
   */
  declareSignals(accountId: string, body: DeclareAccountSignalsRequest): Promise<{ added: number }> {
    return apiFetch<{ added: number }, DeclareAccountSignalsRequest>({
      path: `/accounts/${accountId}/signals/declare`,
      method: 'POST',
      body,
    })
  },

  /**
   * « Décris ton organigramme » (#1103) — Laura met le texte en lignes, OU un
   * FICHIER déposé (PDF, .xlsx, .pptx — #3740, reste ; une image s'y fait
   * refuser nommément côté serveur, faute d'OCR).
   *
   * Ne déclare RIEN : rend une proposition, et `dropped` NOMME ce qui a été
   * retiré faute d'être nommé dans le texte (tapé, ou extrait du fichier).
   * C'est le clic de validation qui appelle `declareOrgPeople`.
   */
  proposeOrgPeopleFromText(
    accountId: string,
    input: { text: string } | { file: { base64: string; name?: string } },
  ): Promise<{ people: DeclareOrgPeopleRequest['people']; dropped: string[] }> {
    return apiFetch<
      { people: DeclareOrgPeopleRequest['people']; dropped: string[] },
      { text?: string; fileBase64?: string; fileName?: string }
    >({
      path: `/analysis/${accountId}/org-people/from-text`,
      method: 'POST',
      body: 'text' in input ? { text: input.text } : { fileBase64: input.file.base64, fileName: input.file.name },
    })
  },

  /**
   * #4072.1 — les organigrammes des DOCUMENTS de l'espace (portée du demandeur :
   * équipe + documents de ce compte). Une PROPOSITION datée par document ; rien
   * n'est écrit, la validation passe par `declareOrgPeople`.
   */
  proposeOrgPeopleFromDocuments(accountId: string): Promise<{
    people: DeclareOrgPeopleRequest['people']
    documentsRead: number
    truncated: boolean
  }> {
    return apiFetch<{ people: DeclareOrgPeopleRequest['people']; documentsRead: number; truncated: boolean }>({
      path: `/analysis/${accountId}/org-people/from-documents`,
      method: 'POST',
    })
  },

  /**
   * #2553 / #3740 — un organigramme PDF / image / PPTX lu côté serveur. Même
   * forme de réponse que `proposeOrgPeopleFromText` : une PROPOSITION, rien
   * d'écrit tant que l'utilisateur n'a pas validé.
   */
  proposeOrgPeopleFromFile(
    accountId: string,
    file: { fileB64: string; filename: string },
  ): Promise<{ people: DeclareOrgPeopleRequest['people']; dropped: string[] }> {
    return apiFetch<{ people: DeclareOrgPeopleRequest['people']; dropped: string[] }, typeof file>({
      path: `/analysis/${accountId}/org-people/from-file`,
      method: 'POST',
      body: file,
    })
  },

  /**
   * « Rattacher ce dossier à un autre » (#1111) — ce que le geste FERA.
   *
   * La MÊME fonction pure que l'écriture applique : la prévisualisation ne peut
   * pas diverger de ce qui sera écrit.
   */
  previewAbsorb(accountId: string, into: string): Promise<AbsorbPreview> {
    return apiFetch<AbsorbPreview>({
      path: `/accounts/${accountId}/absorb/preview?into=${encodeURIComponent(into)}`,
    })
  },

  /** Rattacher ce dossier en double à celui qu'on garde (#1111). Rien n'est
   *  supprimé : le dossier est ARCHIVÉ et dit où il est parti. */
  absorbAccount(accountId: string, into: string): Promise<AbsorbPreview> {
    return apiFetch<AbsorbPreview, { into: string }>({
      path: `/accounts/${accountId}/absorb`,
      method: 'POST',
      body: { into },
    })
  },

  /**
   * Les dossiers du MÊME GROUPE que celui-ci (#1111), dans les deux sens.
   *
   * `merged_into_id` était écrite en base et jamais relue : un dossier archivé
   * par un rattachement n'avait aucune explication à l'écran. C'est la lecture
   * qui manquait.
   */
  accountLinks(accountId: string): Promise<AccountLinks> {
    return apiFetch<AccountLinks>({ path: `/accounts/${accountId}/links` })
  },

  /**
   * #4158.60-.62 (EX-03) — les AUTRES entités du groupe de ce compte, chacune avec son
   * responsable et ses compteurs à elle. L'API ne renvoie que les entités du périmètre du lecteur.
   */
  groupEntities(accountId: string): Promise<GroupEntity[]> {
    return apiFetch<GroupEntity[]>({ path: `/accounts/${accountId}/group-entities` })
  },

  /** « Détacher ce dossier » (#1111) — ce que le geste FERA. N'écrit rien. */
  previewDetach(accountId: string): Promise<DetachPreview> {
    return apiFetch<DetachPreview>({ path: `/accounts/${accountId}/detach/preview` })
  },

  /** Détacher ce dossier de celui auquel il avait été rattaché (#1111). Le
   *  dossier retrouve le statut qu'il avait, ses contacts reviennent. */
  detachAccount(accountId: string): Promise<DetachPreview> {
    return apiFetch<DetachPreview>({ path: `/accounts/${accountId}/detach`, method: 'POST' })
  },

  researchSite(accountId: string): Promise<{ matched: number; total: number }> {
    return apiFetch<{ matched: number; total: number }>({
      path: `/analysis/${accountId}/research-site`,
      method: 'POST',
    })
  },
  /** Partial re-run by dimension (Théo P1) — refresh ONE axis of a completed
   *  dossier (signaux / contacts / entités / stratégie). Re-runs only the
   *  matching phase, reusing the stored outputs of the others, and debits one
   *  enrichment credit. 402 when the enrichment pool is empty. */
  refreshDimension(
    accountId: string,
    dimension: RefreshDimension,
  ): Promise<{ dimension: RefreshDimension; remaining: number; diff?: RefreshDiff }> {
    // #2452.6 — `diff` : ce que CE rafraîchissement a changé (additif, absent
    // d'une API antérieure). L'approfondissement depuis /chat le résume.
    return apiFetch<
      { dimension: RefreshDimension; remaining: number; diff?: RefreshDiff },
      { dimension: RefreshDimension }
    >({
      path: `/analysis/${accountId}/refresh`,
      method: 'POST',
      body: { dimension },
    })
  },
  /** Théo A comptes-fiche-reference.A2 — « Créer une copie de travail » d'un dossier de
   *  référence (archive figée). Idempotent : `created: false` = la copie existait déjà. */
  createWorkingCopy(accountId: string): Promise<{ id: string; created: boolean }> {
    return apiFetch<{ id: string; created: boolean }>({
      path: `/accounts/${accountId}/working-copy`,
      method: 'POST',
    })
  },
  /** #2452.2 / #2452.5 — le devis d'un approfondissement depuis /chat : ce qui
   *  sera réutilisé (0 crédit) et le coût SUPPLÉMENTAIRE. Ne lance rien. */
  deepenQuote(targets: DeepenTarget[]): Promise<DeepenQuote> {
    return apiFetch<DeepenQuote, { targets: DeepenTarget[] }>({
      path: '/analysis/deepen/quote',
      method: 'POST',
      body: { targets },
    })
  },
  /** #2809 (#2293.11, #2294.*) — le devis de la découverte FRAÎCHE de
   *  contacts sur une sélection de comptes : le coût EXACT (par compte)
   *  avant tout lancement. Ne lance rien. */
  discoverFreshContactsQuote(accountIds: string[]): Promise<ContactDiscoveryQuote> {
    return apiFetch<ContactDiscoveryQuote, { accountIds: string[] }>({
      path: '/contacts/discover/quote',
      method: 'POST',
      body: { accountIds },
    })
  },
  /** #2809 — exécute la découverte fraîche sur UN compte. L'appelant boucle
   *  sur la sélection (même discipline que `refreshDimension`). */
  discoverFreshContacts(
    accountId: string,
    titles?: string[],
    // #4058 — expertise cherchée, secteur du client, périmètre : trois champs distincts.
    intent?: ContactDiscoveryRunRequest,
  ): Promise<ContactDiscoveryOutcome> {
    return apiFetch<ContactDiscoveryOutcome, ContactDiscoveryRunRequest>({
      path: `/contacts/discover/${accountId}`,
      method: 'POST',
      body: { titles, ...intent },
    })
  },
  /** Cancel an in-flight analysis. Aborts the worker, revokes the progress
   *  secret, removes the BullMQ job, and flips the account to a cancelled
   *  state on the server. Always 200 if the account is owned — best-effort
   *  on the queue/worker side. */
  cancelAnalysis(accountId: string): Promise<{ accountId: string }> {
    return apiFetch<{ accountId: string }>({
      path: `/analysis/${accountId}/cancel`,
      method: 'POST',
    })
  },
  /** Resume a previously-failed analysis from the last checkpoint. The
   *  backend reads ``analysis.phase_completed`` events from the outbox
   *  and skips every phase that already succeeded — so a fix for a Phase 3
   *  crash doesn't re-pay Brave/Pappers/Firecrawl/Claude for Phase 1. */
  resumeAnalysis(accountId: string): Promise<{ jobId: string; accountId: string }> {
    return apiFetch<{ jobId: string; accountId: string }>({
      path: `/analysis/${accountId}/resume`,
      method: 'POST',
      // #2520 — le serveur rend `in_flight` sur une reprise déjà en vol et ne
      // redébite pas un run déjà payé : rejouable sur une panne de redéploiement.
      idempotent: true,
    })
  },
  /** « Zones blanches » (Drive backlog #5) — carte de couverture décisionnelle du
   *  compte : familles & niveaux hiérarchiques engagés vs. les angles morts à
   *  ouvrir. Calculée server-side à partir des seuls contacts existants du compte
   *  (aucune donnée inventée). */
  coverageGaps(id: string): Promise<CoverageGapsResponse> {
    return apiFetch<CoverageGapsResponse>({ path: `/accounts/${id}/coverage-gaps` })
  },
  /** Avec quel profil ESN ce dossier a été produit (recette finale §6, §13).
   *  `null` = aucun run n'a déclaré sa provenance ; l'appelant n'affiche alors rien
   *  plutôt que d'annoncer une personnalisation qu'il ne peut pas prouver. */
  profileProvenance(id: string): Promise<AccountProfileProvenance | null> {
    return apiFetch<AccountProfileProvenance | null>({ path: `/accounts/${id}/profile-provenance` })
  },
  /**
   * #2306.24 — le MÊME prédicat que `profileProvenance`, agrégé sur le
   * portefeuille entier (`AnalysisRunsService.listAccountsWithOlderProfile`,
   * jamais un second calcul). `accounts` vide = rien à afficher.
   */
  impactedByProfileChange(): Promise<ImpactedAccountsResponse> {
    return apiFetch<ImpactedAccountsResponse>({ path: '/accounts/impacted-by-profile-change' })
  },
  /**
   * #2091.31 — le signal de PORTEFEUILLE EXISTANT pour la carte « prioriser
   * la semaine » de `/welcome`. Même requête que le pont copilote
   * `accounts/to-act` (`AccountsService.accountsAwaitingAction`), jamais un
   * second calcul — seule l'EXISTENCE compte ici (`limit=1` côté serveur).
   */
  hasAccountsToAct(): Promise<HasAccountsToActResponse> {
    return apiFetch<HasAccountsToActResponse>({ path: '/accounts/to-act/summary' })
  },
  /**
   * Les contrôles de qualité qui concernent un COMPTE, compte par compte.
   *
   * Le cockpit COMPTE (« 7 comptes suivis sans prochaine action ») ; cette
   * lecture DÉSIGNE, avec la même règle, pour que la ligne du portefeuille
   * puisse dire si c'est elle. Rien n'est recalculé côté écran.
   */
  hygiene(): Promise<AccountHygieneByAccount> {
    return apiFetch<AccountHygieneByAccount>({ path: '/accounts/hygiene' })
  },
  /** Distinct sectors / companies pour alimenter dynamiquement la `FilterBar`. */
  listSectors(): Promise<string[]> {
    return apiFetch<string[]>({ path: '/accounts/sectors' })
  },
  listCompanies(): Promise<string[]> {
    return apiFetch<string[]>({ path: '/accounts/companies' })
  },
  /** #2159.26 — les étiquettes EN USAGE sur les comptes, pour la `FilterBar`. */
  listTags(): Promise<string[]> {
    return apiFetch<string[]>({ path: '/accounts/tags' })
  },
  /** #2145.9 / #2100.9 — les jobs d'analyse EN COURS, pour la mise en avant sur Aujourd'hui. */
  listActiveAnalysisRuns(): Promise<ActiveAnalysisRun[]> {
    return apiFetch<ActiveAnalysisRun[]>({ path: '/accounts/analyzing' })
  },
  listSimilarToExplore(): Promise<SimilarAccountSuggestion[]> {
    return apiFetch<SimilarAccountSuggestion[]>({ path: '/accounts/similar-to-explore' })
  },
  /** "Comptes similaires à CE compte" — seeded by the account's NAF code (Théo p.41). */
  listSimilarToAccount(id: string): Promise<SimilarAccountSuggestion[]> {
    return apiFetch<SimilarAccountSuggestion[]>({ path: `/accounts/${id}/similar` })
  },
  /**
   * #2127.37 — masque/démasque une suggestion « compte similaire », pour
   * l'appelant sur ce compte. PERSISTANT (table dédiée côté API, jamais
   * supprimée) : `on: false` démasque, il n'efface rien.
   */
  setSimilarSuggestionDismissed(
    accountId: string,
    candidateSiren: string,
    on: boolean,
  ): Promise<{ dismissed: boolean }> {
    return apiFetch<{ dismissed: boolean }>({
      path: `/accounts/${accountId}/similar/${candidateSiren}/dismiss`,
      method: on ? 'POST' : 'DELETE',
    })
  },
  /** "Historique des analyses" — the append-only run log for this account,
   *  newest first (Théo P0 : « Un compte racine, plusieurs AnalysisRun »). */
  listRuns(id: string): Promise<AnalysisRun[]> {
    return apiFetch<AnalysisRun[]>({ path: `/accounts/${id}/runs` })
  },
  /** #3212.4/.6 (épopée #3235) — la révision de verdict entre les deux
   *  derniers runs terminés, ou `null` s'il n'y a rien d'honnête à montrer. */
  getVerdictRevision(id: string): Promise<VerdictRevision | null> {
    return apiFetch<VerdictRevision | null>({ path: `/accounts/${id}/verdict-revision` })
  },
  /** #4180 — « même verdict depuis le … » : `null` si le verdict a changé, est illisible ou sans 2 analyses. */
  getVerdictUnchanged(id: string): Promise<VerdictUnchanged | null> {
    return apiFetch<VerdictUnchanged | null>({ path: `/accounts/${id}/verdict-unchanged` })
  },
  /** « Vocabulaire du groupe » (Théo P1 p.17/21) — la grille de lecture du
   *  compte : terme / sens / impact commercial / source / statut de vérité. */
  listVocabulary(accountId: string): Promise<AnalysisVocabularyTerm[]> {
    return apiFetch<AnalysisVocabularyTerm[]>({ path: `/analysis/${accountId}/vocabulary` })
  },
  /** #3918.b — les signaux CRM rattachés au compte (affaire perdue, dormante, à renouveler). */
  async getCrmSignals(id: string): Promise<AccountCrmSignals> {
    // GA-10 (API) — the list comes qualified with `crm_connected`; #3918.2 (r40) adds `linked_deals`
    // so an empty watch can say WHY (no CRM / no linked deal) instead of staying silent.
    const result = await apiFetch<{ items: RecentSignal[]; crm_connected: boolean; linked_deals?: number }>({
      path: `/crm/accounts/${id}/signals`,
    })
    return {
      items: result?.items ?? [],
      crmConnected: result?.crm_connected === true,
      linkedDeals: typeof result?.linked_deals === 'number' ? result.linked_deals : null,
    }
  },

  /** SYNC-A — les affaires et activités du compte copiées depuis le CRM branché (le miroir). */
  getCrmMirror(id: string): Promise<CrmMirrorAccountView> {
    return apiFetch<CrmMirrorAccountView>({ path: `/crm/mirror/accounts/${id}` })
  },

  /**
   * #3916.b — TOUTES les annonces de registre public (BODACC, ouvertures Sirene)
   * lues en continu pour le SIREN du compte, et la date de la dernière lecture.
   */
  async getRegistryAnnouncements(id: string): Promise<AccountRegistryAnnouncements> {
    return apiFetch<AccountRegistryAnnouncements>({ path: `/accounts/${id}/registry-announcements` })
  },
  /** #3970 — qui a rejoint le compte ces 6 derniers mois, et pourquoi ça colle au contexte de l'espace. */
  async getRecentHires(id: string): Promise<AccountRecentHires> {
    return apiFetch<AccountRecentHires>({ path: `/accounts/${id}/recent-hires` })
  },
  /** Louis 30/10 — les offres d'emploi du compte pour le métier saisi (vide : tous métiers), au plus 50. */
  async getJobOffers(id: string, term: string): Promise<AccountJobOffers> {
    const query = term ? `?${new URLSearchParams({ term }).toString()}` : ''
    return apiFetch<AccountJobOffers>({ path: `/accounts/${id}/job-offers${query}` })
  },
  /**
   * #1582 — le contexte marché d'un compte, pour le popover de sa ligne.
   *
   * Lu À LA DEMANDE, jamais sur les 25 lignes de la page : le popover s'ouvre
   * sur un compte à la fois, et `market_paths_observed` — déjà porté par la
   * liste — suffit à décider si l'icône se rend.
   *
   * ⚠️ TROIS réponses, et l'appelant doit les distinguer : l'objet (couvert),
   * `null` (lu, non couvert — l'écran ne rend rien), et une ERREUR (503 : la
   * mémoire n'a pas pu être lue). Traiter le 503 comme un `null` referait le
   * défaut de GA-179 — une panne racontée comme une bonne nouvelle.
   */
  /**
   * #1608, #1640.3 — `?? null`, et ce n'est pas de la coquetterie.
   *
   * La route rend `null` pour un compte non couvert par la mémoire marché, et
   * NestJS sérialise ce `null` en corps VIDE : `apiFetch` en fait donc
   * `undefined`. Or **React Query v5 refuse un `queryFn` qui rend `undefined`**
   * (« Query data cannot be undefined ») — la requête partirait en `isError`,
   * et les deux cartes du dossier écriraient « Mémoire marché indisponible »,
   * une PANNE, là où la réponse honnête est « Non mesuré ».
   *
   * `null` est la valeur que le contrat annonce et la seule que les cartes
   * savent traduire. Gardé par `market-context-absent-is-null.test.ts`.
   */
  async getMarketContext(id: string): Promise<AccountMarketContext | null> {
    return (await apiFetch<AccountMarketContext | null>({ path: `/accounts/${id}/market-context` })) ?? null
  },
  /** #5192 — le détail des parcours observés (sans identifiant) derrière « Voir les détails ». */
  async getMarketPaths(id: string): Promise<AccountMarketPaths> {
    return apiFetch<AccountMarketPaths>({ path: `/accounts/${id}/market-paths` })
  } /**
   * #4742 — la structure technique d'UN compte : cinq axes, chaque technologie
   * avec sa preuve datée, et les axes NON OBSERVÉS nommés. La route rend toujours
   * un objet (jamais `null`) : un compte sans preuve rend cinq axes `not_observed`.
   */,
  async getTechStructure(id: string): Promise<AccountTechStructure> {
    return apiFetch<AccountTechStructure>({ path: `/accounts/${id}/tech-structure` })
  },

  /**
   * #2556 — sur un compte DÉJÀ connu, ce qui a bougé, daté et sourcé, ou
   * l'aveu honnête qu'il n'y a rien de neuf. `known: false` sur un compte non
   * connu : la page n'a même pas à poser la question.
   */
  /**
   * #190.1/#190.2 (épopée #3219) — les contradictions de champ du dossier :
   * `GET /accounts/:id/conflicts?include=settled`. Les ouvertes (`unresolved`)
   * ET celles que le produit a tranchées tout seul, distinguées par `resolvedBy`.
   */
  async getFieldConflicts(id: string): Promise<ConflictedField[]> {
    const res = await apiFetch<{ items: ConflictedField[] }>({ path: `/accounts/${id}/conflicts?include=settled` })
    return res?.items ?? []
  },
  /** #5017.2 — `GET /consultants/knowing-sector?sector=` : les consultants de l'espace qui connaissent le secteur. */
  getConsultantsKnowingSector(sector: string): Promise<ConsultantSectorKnowledgeList> {
    return apiFetch<ConsultantSectorKnowledgeList>({
      path: `/consultants/knowing-sector?sector=${encodeURIComponent(sector)}`,
    })
  },
  getKnownMovements(id: string): Promise<AccountKnownMovements> {
    return apiFetch<AccountKnownMovements>({ path: `/accounts/${id}/known-movements` })
  },
  /** #4180 — ce qui a changé depuis la dernière vérification : `GET /accounts/:id/changes-since-check`. */
  getChangesSinceCheck(id: string): Promise<AccountChanges> {
    return apiFetch<AccountChanges>({ path: `/accounts/${id}/changes-since-check` })
  },
  /**
   * #2116 — LE contexte canonique du dossier : `GET /accounts/:id/intelligence-context`.
   *
   * La route existait depuis #1618 et AUCUN écran ne l'appelait — le défaut
   * n°1 du dépôt, du code juste que personne n'appelle. C'est elle qui arbitre
   * quelle source croire quand deux se contredisent, et qui date chaque
   * valeur : les écrans n'ont donc plus à le refaire chacun de leur côté.
   *
   * ⚠️ La réponse peut être `{ status: 'unavailable' }` — la façade est un
   * module `@Optional()`. Ce n'est PAS un contexte vide : « on ne sait rien de
   * ce compte » serait faux et rassurant à la fois, d'où le type d'union que
   * l'appelant doit ouvrir (`isAccountIntelligenceUnavailable`).
   */
  getIntelligenceContext(id: string): Promise<AccountIntelligenceContextView | { status: 'unavailable' }> {
    return apiFetch<AccountIntelligenceContextView | { status: 'unavailable' }>({
      path: `/accounts/${id}/intelligence-context`,
    })
  },
  /**
   * BEL-SC-225 (#3254, P0) — LA projection `AccountStrategy5P` :
   * `GET /accounts/:id/strategy-5p`. Maison canonique du ticket, même
   * discipline que `getIntelligenceContext` juste au-dessus : la réponse
   * peut être `{ status: 'unavailable' }` (façade `@Optional()`), jamais
   * une projection vide.
   */
  getStrategy5P(id: string): Promise<AccountStrategy5P | { status: 'unavailable' }> {
    return apiFetch<AccountStrategy5P | { status: 'unavailable' }>({
      path: `/accounts/${id}/strategy-5p`,
    })
  },
  /**
   * BEL-SC-229 (#3258, P0) — LA matrice `AccountInterestPenetrability` :
   * `GET /accounts/:id/interest-penetrability`. Même discipline que
   * `getStrategy5P` juste au-dessus.
   */
  getInterestPenetrability(id: string): Promise<AccountInterestPenetrability | { status: 'unavailable' }> {
    return apiFetch<AccountInterestPenetrability | { status: 'unavailable' }>({
      path: `/accounts/${id}/interest-penetrability`,
    })
  },
  /** #3920.10 (Louis 15/10) — les quatre signaux de variation d'un compte, lecture seule. */
  getVariationSignals(id: string): Promise<{ signals: AccountVariationSignal[] } | { status: 'unavailable' }> {
    return apiFetch<{ signals: AccountVariationSignal[] } | { status: 'unavailable' }>({
      path: `/accounts/${id}/variation-signals`,
    })
  },
  /**
   * BEL-SC-229 (#3258.13, épopée #3362, lot P01) — LA LECTURE PORTEFEUILLE :
   * `GET /accounts/interest-penetrability-portfolio`. Même discipline que
   * `getInterestPenetrability` juste au-dessus.
   */
  getInterestPenetrabilityPortfolio(): Promise<AccountInterestPenetrabilityPortfolio | { status: 'unavailable' }> {
    return apiFetch<AccountInterestPenetrabilityPortfolio | { status: 'unavailable' }>({
      path: '/accounts/interest-penetrability-portfolio',
    })
  },
  /** Cost transparency per account (Drive backlog #12) — the ALREADY-tracked API +
   *  run spend for this account. Every figure reads a stored column; nothing invented. */
  getCost(id: string): Promise<AccountCostSummary> {
    return apiFetch<AccountCostSummary>({ path: `/accounts/${id}/cost` })
  },
  /** Paginated slice of ``raw_analysis.branches``; backs the "Voir plus" button
   *  in ``SitesFranceCard`` so we don't ship 1000+ Pappers branches on the
   *  initial account GET. */
  listBranches(id: string, offset: number, limit: number): Promise<PaginatedResult<unknown>> {
    const qs = new URLSearchParams({ offset: String(offset), limit: String(limit) }).toString()
    return apiFetch({ path: `/accounts/${id}/branches?${qs}` })
  },
  /** On-demand competitive battle card (nous vs the ESN already on the account).
   *  Proxied to the IA `/battlecard/generate`; `userId` comes from the JWT and the
   *  ESN profile is resolved server-side. Single AI call — present-only, sourced. */
  battlecard(accountId: string): Promise<{ success: boolean; data: BattlecardData }> {
    return apiFetch<{ success: boolean; data: BattlecardData }, { accountId: string }>({
      path: '/ia/battlecard',
      method: 'POST',
      body: { accountId },
    })
  },
  /** On-demand AI prioritisation of 2–5 picked accounts. Proxied to the IA
   *  `/compare`; the IA scopes the read to the JWT user, so non-owned ids drop out. */
  compareAI(accountIds: string[]): Promise<{ success: boolean; data: CompareData }> {
    return apiFetch<{ success: boolean; data: CompareData }, { accountIds: string[] }>({
      path: '/ia/compare',
      method: 'POST',
      body: { accountIds },
    })
  },
  /**
   * Planificateur d'enrichissement de l'organigramme (§11 FINAL) — l'estimation
   * SEULE : combien de contacts, combien de vagues, combien de crédits pour un
   * mode de ciblage donné. Ne crée rien, ne débite rien.
   */
  enrichmentPlan(accountId: string, params: OrgEnrichmentPlanRequest): Promise<OrgEnrichmentPlanEstimate> {
    return apiFetch<OrgEnrichmentPlanEstimate, OrgEnrichmentPlanRequest>({
      path: `/analysis/${accountId}/enrichment-plan`,
      method: 'POST',
      body: params,
    })
  },
  /** Lance UNE vague du mode demandé — le clic « Lancer » après l'estimation
   *  ci-dessus. `remaining > 0` : relancer le MÊME mode reprend au lot suivant. */
  enrichmentConfirm(accountId: string, params: OrgEnrichmentPlanRequest): Promise<OrgEnrichmentWaveResult> {
    return apiFetch<OrgEnrichmentWaveResult, OrgEnrichmentPlanRequest>({
      path: `/analysis/${accountId}/enrichment-confirm`,
      method: 'POST',
      body: params,
    })
  },
}

/**
 * Stable query keys.
 *  - `list(userId)` — prefix (3 segments) for `invalidateQueries` :
 *     hit toutes les combinaisons de filtres cachées pour cet utilisateur.
 *  - `useAccounts` y ajoute `filters` en 4ᵉ segment pour cacher chaque
 *     combinaison indépendamment (cf. `AccountsListQueryKey`).
 */
type AccountsListPrefixKey = readonly ['accounts', 'list', string | undefined]
export type AccountsListQueryKey = readonly ['accounts', 'list', string | undefined, AccountListQuery]

export const accountKeys = {
  all: ['accounts'] as const,
  list: (userId: string | undefined): AccountsListPrefixKey => ['accounts', 'list', userId],
  signals: (userId: string | undefined) => ['accounts', 'signals', userId] as const,
  needs: (userId: string | undefined) => ['accounts', 'needs', userId] as const,
  /** Les contrôles de qualité par compte. UNE clé pour tout l'écran : deux
   *  lectures de la même question donneraient deux réponses pour une ligne. */
  hygiene: () => ['accounts', 'hygiene'] as const,
  /** #2165.13 — les comptes marqués « meilleure référence », la source du
   *  preset Découvrir. UNE clé pour tout l'espace : deux lectures de la même
   *  question donneraient deux réponses. */
  bestReferences: () => ['accounts', 'best-references'] as const,
  betProfile: (id: string) => ['accounts', 'bet-profile', id] as const,
  committeeEntryLevel: (id: string) => ['accounts', 'committee-entry-level', id] as const,
  betProfiles: () => ['accounts', 'bet-profiles'] as const,
  detail: (id: string) => ['account', id] as const,
  /** #2915.3 — « Historique des analyses » (AccountRunsContainer). UNE clé
   *  pour ce compte, partagée par `useAccountRuns` et l'invalidation
   *  `analysis:done`/`analysis:error` (`analysis-subscription.ts`) : sans ça,
   *  le panneau restait sur les lignes lues avant une reprise, `staleTime`
   *  (60 s) ne suffisant pas tant que rien ne force le refetch. */
  runs: (id: string) => ['accounts', 'runs', id] as const,
  /** #3212.4/.6 — la révision de verdict entre les deux derniers runs. */
  verdictRevision: (id: string) => ['accounts', 'verdict-revision', id] as const,
  /** #4180 — même verdict depuis le … */
  verdictUnchanged: (id: string) => ['accounts', 'verdict-unchanged', id] as const,
  coverageGaps: (id: string | undefined) => ['account', 'coverage-gaps', id] as const,
  orgRebuild: (id: string) => ['account', 'org-rebuild', id] as const,
  /** Estimation du planificateur d'enrichissement — un mode + ses paramètres
   *  forment la clé, pour qu'un changement de cible réinterroge le serveur. */
  enrichmentPlan: (id: string, params: OrgEnrichmentPlanRequest | null) =>
    ['account', 'enrichment-plan', id, params] as const,
  profileProvenance: (id: string | undefined) => ['account', 'profile-provenance', id] as const,
  /** #2786/#2126.62 — LA clé du contexte canonique (#2116), partagée par
   *  `useAccountIntelligenceContext` et l'invalidation d'une correction
   *  (`usePatchAccount`) : une correction qui ne l'invaliderait pas resterait
   *  visible sur la fiche compte et FAUSSE sur les onglets qui lisent la
   *  façade, jusqu'à `staleTime` (5 min) ou un rechargement complet. */
  intelligenceContext: (id: string | undefined) => ['accounts', 'intelligence-context', id] as const,
  /** BEL-SC-225 (#3254) — la clé de la projection `AccountStrategy5P`. */
  strategy5P: (id: string | undefined) => ['accounts', 'strategy-5p', id] as const,
  /** BEL-SC-229 (#3258) — la clé de la matrice `AccountInterestPenetrability`. */
  variationSignals: (id: string | undefined) => ['accounts', 'variation-signals', id] as const,
  interestPenetrability: (id: string | undefined) => ['accounts', 'interest-penetrability', id] as const,
  /** #3258.13 (épopée #3362) — UNE clé pour tout le portefeuille (même prédicat pour tous). */
  interestPenetrabilityPortfolio: () => ['accounts', 'interest-penetrability-portfolio'] as const,
  /** #2306.24 — UNE clé pour tout le portefeuille (même prédicat pour tous). */
  impactedByProfileChange: () => ['accounts', 'impacted-by-profile-change'] as const,
  /** #2091.31 — UNE clé pour le signal de portefeuille de `/welcome`. */
  hasAccountsToAct: () => ['accounts', 'to-act-summary'] as const,
  /** Les dossiers du même groupe (#1111), dans les deux sens. */
  links: (id: string) => ['account', 'links', id] as const,
  /** #4158.60-.62 — les autres entités du groupe (une fiche par entité). */
  groupEntities: (id: string) => ['account', 'group-entities', id] as const,
}
