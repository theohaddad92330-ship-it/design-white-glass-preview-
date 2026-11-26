import { compactSector } from '@bellum/utils'
import {
  ACCOUNT_SCORE_GO_MIN,
  type AccountSignalItem,
  classifyTemporalStatus,
  isSegmentCollectionStale,
  type SalesProfileForRelevance,
  isSignalArchived,
  parseSignalDate,
  type SignalImportance,
  type SignalRecurrence,
  SEGMENT_CAPABILITY_EPOCH,
  type AccountSignalLine,
  type SignalLineType,
  signalSortMs,
  type TemporalStatus,
  watchlistRuleMatches,
  type WatchlistRule,
} from '@bellum/contracts'
import { i18n } from '@/i18n'
import {
  hiringDisplayLabel,
  hiringNoticeForSignals,
  isHiringSignal,
  isOutOfTradeHiring,
  type HiringDomainNotice,
} from '@/features/discover/lib/discover-hiring-domain'
import { normalizeRequester } from '@/features/discover/lib/discover-normalize'
import type { DiscoverOfferRequester } from '@/features/discover/lib/discover-types'

type WatchlistStatus = 'new' | 'review' | 'follow-up'

export type WatchlistItem = {
  accountId: string
  companyName: string
  id: string
  sector: string
  signalDate: string
  signalLabel: string
  /** #3901.w — le libellé AFFICHÉ (secteur du recrutement selon le profil déclaré) ; `signalLabel`
   *  reste le texte d'origine (recherche, règles, « vérifier »). Absent = afficher `signalLabel`. */
  displayLabel?: string
  signalSource: string
  /** #3922.3 — le lien vérifiable de la source (flux unique `GET /accounts/signals`) ; `null` = « Sans lien vérifiable ». */
  sourceUrl?: string | null
  sourceKind?: string | null
  /** #4182.5 — qui demande ce profil, pour une offre : étayé par son texte, sinon « à identifier ». */
  requester?: DiscoverOfferRequester | null
  /** #4437.5 — le rattachement de l'offre (compétences, famille, extrait lu) ; `null` = collecte antérieure, jamais deviné. */
  offerAttachment?: AccountSignalItem['offer_attachment']
  /** #4756 — le lieu d'une offre tel que le collecteur l'a lu ; absent = inconnu, jamais deviné (filtre « zone » de l'Historique). */
  location?: string | null
  /** Lot 772 — siège / adresse du compte, dernier recours de la zone quand le lieu du besoin ne se lit dans aucune région. */
  accountLocation?: string | null
  /** #3922.3 — la collecte du segment signaux précède la capacité « lien » : l'absence de lien se DIT. */
  collectedBeforeLink?: boolean
  signalType: string
  score: number | null
  status: WatchlistStatus
  // Archived (2021-style) signals are excluded from "nouveaux signaux" so the
  // Veille count matches the Cockpit (Théo p.35/p.40).
  archived: boolean
  // ── Historique du signal (V2 §11) ─────────────────────────────────────────
  // `signalDate` est la date de la NOUVELLE ; ci-dessous, ce que Bellum a
  // observé. Absent tant qu'aucun historique n'a été matérialisé (compte jamais
  // ré-analysé depuis) — on n'affiche alors rien plutôt qu'une date devinée.
  firstDetectedAt: string | null
  /** false = ligne issue du backfill : « suivi depuis », jamais « détecté le ». */
  firstDetectionExact: boolean
  lastSeenAt: string | null
  changeCount: number
  /** Le signal n'apparaît plus dans la dernière analyse. */
  resolved: boolean
  resolvedAt: string | null
  // ── L'objet `Signal` complété (V2 §20) ────────────────────────────────────
  /** Pondération DÉRIVÉE de règles existantes (archive + « sans source, pas de
   *  preuve »). `null` quand rien ne permet de la calculer : l'écran n'affiche
   *  alors aucun badge plutôt qu'une importance devinée. */
  importance: SignalImportance | null
  /** L'action que ce signal a déclenchée, telle qu'elle est intitulée dans le
   *  plan. `null` tant qu'il n'a rien produit. */
  triggeredActionLabel: string | null
  /** #3206.2 (partiel, épopée #3240) — la dernière fois qu'un commercial a
   *  cliqué « Marquer vérifié » sur ce signal. `null` tant que personne ne l'a
   *  fait — jamais déduit d'une re-détection. */
  lastVerifiedAt: string | null
  /** Théo L1 — sélecteur avancé — l'identifiant de la ligne d'historique : c'est par lui
   *  qu'une offre d'emploi se désigne comme périmètre de Laura. Absent = non historisé. */
  historyId?: string | null
  /** #3206.3 (épopée #3240) — RECENT/HISTORICAL/STALE/UNDATED/
   *  CURRENT_VERIFIED, dérivé par {@link classifyTemporalStatus}. `null` quand
   *  rien ne situe le signal dans le temps (jamais une devinette). */
  temporalStatus: TemporalStatus | null
  /**
   * « Ce que ça peut vouloir dire commercialement », écrit par l'analyse pour CE
   * signal (#1424). `null` quand elle n'a rien dit — l'écran retombe alors sur
   * son conseil générique, jamais sur une lecture inventée.
   */
  salesImplication: string | null
  /**
   * #2107.31 — l'AMPLEUR business du signal pour l'entreprise cible elle-même
   * (« transformation du groupe entier », « renfort ponctuel »), distincte de
   * `salesImplication` (« pourquoi pour l'ESN »). `null` quand l'analyse ne
   * l'a pas évaluée — jamais une gravité déduite du type de signal.
   */
  impact: string | null
  /** De quoi RECONNAÎTRE l'entreprise (#1423) : le logo persisté, et le site qui
   *  sert au repli favicon calculé à l'affichage. */
  logoUrl: string | null
  website: string | null
  /**
   * #4088.2 — « qui ça concerne » : le décideur de tête du compte (le premier du
   * chemin recommandé des contacts, calculé côté API). `null` = aucun contact
   * classable — jamais un nom deviné.
   */
  decisionMaker?: { name: string; title: string | null } | null
  /**
   * Lot 764 — la ligne vient du LECTEUR UNIQUE des signaux d'un compte (`GET /accounts/signal-history`) : déjà
   * datée, titrée et dédoublonnée par l'API, de n'importe quelle famille. Absent = item du flux de la Veille.
   */
  signalLineType?: SignalLineType
  /** Lot 767 — la ligne complète du lecteur unique : le dépli de l'Historique rend la MÊME ligne que l'onglet compte. */
  signalLine?: AccountSignalLine
}

/**
 * #5191 — UN SIGNAL DE RECRUTEMENT : le type de ligne quand le lecteur unique l'a posé, sinon la classification de la
 * Veille (offre d'emploi). Sert l'ORDRE par défaut des listes (recrutements en tête) — jamais un filtre.
 */
export function isRecruitmentItem(item: Pick<WatchlistItem, 'signalType' | 'signalLabel' | 'signalLineType'>): boolean {
  return item.signalLineType !== undefined ? item.signalLineType === 'recrutement' : itemNeedKind(item) === 'hiring'
}

/** #5191 — les éléments pour lesquels `isHiring` est vrai passent en tête, chaque moitié gardant son ordre. */
export function recruitmentFirst<T>(list: readonly T[], isHiring: (entry: T) => boolean): T[] {
  return [...list.filter(isHiring), ...list.filter(entry => !isHiring(entry))]
}

/** #3922.3 — même critère que `SegmentStaleCollectionNotice` (GA-26) : un seul endroit décide « concerné ». */
function signalsCollectedBeforeLink(collectedAt: string | null | undefined): boolean {
  const epoch = SEGMENT_CAPABILITY_EPOCH.signals
  return epoch ? isSegmentCollectionStale(collectedAt ?? null, epoch) : false
}

export function buildWatchlistItems(signals: AccountSignalItem[]): WatchlistItem[] {
  const now = Date.now()
  return signals.map(signal => ({
    accountId: signal.account_id,
    companyName: signal.company_name,
    id: signal.id,
    sector: signal.sector || i18n.t('watchlist:model.sectorFallback'),
    signalDate: signal.date || signal.account_created_at,
    signalLabel: signal.label,
    signalSource: signal.source || i18n.t('watchlist:model.sourceFallback'),
    sourceUrl: signal.source_url ?? null,
    sourceKind: signal.source_kind ?? null,
    requester: normalizeRequester(signal.requester),
    offerAttachment: signal.offer_attachment ?? null,
    location: signal.location ?? null,
    collectedBeforeLink: signalsCollectedBeforeLink(signal.signals_collected_at),
    signalType: signal.type || i18n.t('watchlist:model.typeFallback'),
    score: signal.account_score,
    status: statusFromDate(signal.date || signal.account_created_at),
    archived: isSignalArchived({ freshness: signal.freshness, date: signal.date }, now),
    firstDetectedAt: signal.first_detected_at ?? null,
    firstDetectionExact: signal.first_detection_exact ?? false,
    lastSeenAt: signal.last_seen_at ?? null,
    changeCount: signal.change_count ?? 0,
    resolved: signal.history_status === 'resolved',
    resolvedAt: signal.resolved_at ?? null,
    importance: signal.importance ?? null,
    triggeredActionLabel: signal.action_id ? signal.action_label?.trim() || null : null,
    lastVerifiedAt: signal.last_verified_at ?? null,
    historyId: signal.history_id ?? null,
    temporalStatus: classifyTemporalStatus(
      {
        temporal_status: signal.temporal_status,
        freshness: signal.freshness,
        date: signal.date,
        type: signal.type,
        last_verified_at: signal.last_verified_at,
        history_status: signal.history_status,
      },
      now,
    ),
    // #1424 / #1423 — la lecture commerciale et le logo. Calculés, stockés,
    // semés en démo, et jetés par la projection jusqu'au 04/09/2026.
    salesImplication: signal.sales_implication?.trim() || null,
    impact: signal.impact?.trim() || null,
    logoUrl: signal.logo_url ?? null,
    website: signal.website ?? null,
    decisionMaker: signal.decision_maker
      ? { name: signal.decision_maker.name, title: signal.decision_maker.title }
      : null,
  }))
}

// Théo p.35 : la Veille doit être CENTRÉE COMPTE, pas une liste plate de signaux
// (5 signaux SNCF = 1 ligne « SNCF · 5 signaux », pas 5 lignes « SNCF »).
export type WatchlistAccountGroup = {
  accountId: string
  companyName: string
  sector: string
  score: number | null
  // #4088.2 — le signal LE PLUS FORT de la ligne (voir `signalStrengthCompare`) ;
  // sert aussi de sélection pour le panneau de détail. Nom historique : c'était le
  // plus récent actif, c'est resté le critère de départage.
  latest: WatchlistItem
  /** #4088.2 — « +N autres » : les AUTRES signaux du compte, du plus fort au plus faible. */
  others: WatchlistItem[]
  /** #4088.2 — « qui ça concerne » : le décideur de tête du compte, ou `null`. */
  decisionMaker: WatchlistItem['decisionMaker']
  /** #4088.7 — pourquoi le compte est écarté de la vue par défaut ; `null` = il y reste. */
  discardReason: DiscardReason | null
  /** #4284.10 — le signal de tête est une offre hors du métier de l'ESN : rang bas + marque, jamais écarté. */
  outOfTrade?: boolean
  activeSignalCount: number
  totalSignalCount: number
  status: WatchlistStatus
}

const NO_TYPES: ReadonlySet<WatchlistTypeFacet> = new Set()

const IMPORTANCE_RANK: Record<SignalImportance, number> = { high: 3, medium: 2, low: 1 }

/**
 * #4088.2 — « le signal le plus fort » d'un compte, du plus fort au plus faible :
 *  1. un signal ACTIF avant un archivé ;
 *  2. un signal qui ne sera pas écarté (stage, hors domaine, presse générale) ;
 *  3. un type qui porte un besoin d'ESN lisible (`signalNeedKind`) ;
 *  4. l'importance dérivée (haute > moyenne > basse ; absente = en dernier) ;
 *  5. le plus récent.
 * Aucune probabilité, aucun score inventé : des faits déjà portés par le signal.
 */
/**
 * #4403.1 (recette PROD 22/10) — UNE lecture de « cette ligne est un recrutement » pour /mes-cibles. Le prédicat de
 * Découvrir (`isHiringKind`) n'ancre que sur le DÉBUT du type (« Recrutement… », « Emploi… ») : un type libre d'analyse
 * comme « Offre d'emploi » n'était jamais marqué ni rangé. Le classeur du besoin (`signalNeedKind`, sous-chaîne) voit
 * ces types ; on le réutilise pour que les deux lisent pareil (GA-26).
 */
function hiringTyped(
  item: Pick<WatchlistItem, 'signalType' | 'signalLabel'> & Partial<Pick<WatchlistItem, 'sourceKind' | 'requester'>>,
): { type: string; label: string } {
  const hiring = signalNeedKind(item.signalType, item.signalLabel) === 'hiring' || isUntypedOffer(item)
  return { type: hiring ? 'hiring' : item.signalType, label: item.signalLabel }
}

/** #4286.12 — « ce signal est un recrutement » : la MÊME lecture que `isOutOfTrade` (GA-26), exposée au détail. */
export function isHiringSignalItem(
  item: Pick<WatchlistItem, 'signalType' | 'signalLabel'> & Partial<Pick<WatchlistItem, 'sourceKind' | 'requester'>>,
): boolean {
  return hiringTyped(item).type === 'hiring'
}

/** Mentions qui n'existent que sur une offre d'emploi (« H/F », type de contrat). */
const OFFER_MARK_RE = /(?:\b[hf]\s*\/\s*[hf]\b|\(\s*[hf]\s*\/\s*[hf]\s*\)|\b(?:cdi|cdd|alternance|int[ée]rim)\b)/i

/**
 * #4403.1 — RÉFUTÉ en recette PROD 23/10 : la catégorie du signal ABSENTE (`type: null` → « Signal ») et un poste sans
 * métier classé (« Contrôleur de gestion », « Front Office Agent ») : la ligne n'était jamais lue comme un recrutement,
 * donc jamais marquée « hors métier ». Une offre se reconnaît aussi à SA source (lien d'offre, demandeur lu par la
 * collecte) ou à une mention propre aux offres (« H/F », CDI…). Un autre besoin reconnu (levée, dirigeant…) n'est
 * jamais réétiqueté.
 */
function isUntypedOffer(
  item: Pick<WatchlistItem, 'signalType' | 'signalLabel'> & Partial<Pick<WatchlistItem, 'sourceKind' | 'requester'>>,
): boolean {
  if (signalNeedKind(item.signalType, item.signalLabel) !== null) return false
  if (item.sourceKind === 'job' || Boolean(item.requester)) return true
  return isGenericSignalType(item.signalType) && OFFER_MARK_RE.test(item.signalLabel)
}

/** #4403.1 — UN prédicat « hors de ton métier » pour la veille, le tableau et la bibliothèque de signaux (GA-26). */
export function isOutOfTrade(item: WatchlistItem, profile: SalesProfileForRelevance | undefined): boolean {
  return isStockQuoteSignal(item) || isOutOfTradeHiring(hiringTyped(item), profile)
}

// #4403.1 (recette prod 26/10) — un cours de bourse n'est un signal de recrutement pour aucune ESN : hors métier QUEL QUE
// SOIT le profil (comme un poste que nulle ESN ne place). Une introduction en bourse, une levée ou un rachat d'actions
// restent des faits d'entreprise : seul le COURS (cotation, variation du titre) est visé.
const STOCK_QUOTE_RE =
  /(?:cours\s+de\s+bourse|cours\s+de\s+l.action|cotation|s[ée]ance\s+(?:de\s+)?bourse|bourse\s+de\s+paris|\bCAC\s?40\b|\bSBF\s?120\b|(?:titre|action)\s+[^.]{0,40}?\b(?:gagne|perd|recule|progresse|grimpe|chute|cl[ôo]ture)\b)/iu

function isStockQuoteSignal(item: Pick<WatchlistItem, 'signalType' | 'signalLabel'>): boolean {
  if (itemNeedKind(item) !== null) return false
  return STOCK_QUOTE_RE.test(item.signalLabel)
}

function signalStrengthCompare(
  profile: SalesProfileForRelevance | undefined,
  types: ReadonlySet<WatchlistTypeFacet> = NO_TYPES,
) {
  const ofType = (item: WatchlistItem): number => {
    if (types.size === 0) return 0
    const facet = signalTypeFacet(item, profile)
    return Number(facet !== null && types.has(facet))
  }
  return (a: WatchlistItem, b: WatchlistItem): number => {
    const active = Number(!b.archived) - Number(!a.archived)
    if (active !== 0) return active
    // #4088.10 — type filtré : le signal le plus fort DE CE TYPE passe en tête.
    const typed = ofType(b) - ofType(a)
    if (typed !== 0) return typed
    const kept = Number(!signalDiscardReason(b, profile)) - Number(!signalDiscardReason(a, profile))
    if (kept !== 0) return kept
    // #4284.10 — l'offre hors métier passe après les autres signaux du compte (rang bas, jamais écartée).
    const inTrade = Number(!isOutOfTrade(b, profile)) - Number(!isOutOfTrade(a, profile))
    if (inTrade !== 0) return inTrade
    const need = Number(itemNeedKind(b) !== null) - Number(itemNeedKind(a) !== null)
    if (need !== 0) return need
    const importance =
      (b.importance ? IMPORTANCE_RANK[b.importance] : 0) - (a.importance ? IMPORTANCE_RANK[a.importance] : 0)
    if (importance !== 0) return importance
    return signalTime(b) - signalTime(a)
  }
}

/**
 * Regroupe les signaux par compte (Théo p.35). Une ligne par compte, portant le
 * signal le plus fort + ses autres signaux. Tri : comptes avec au moins un signal
 * actif d'abord, puis score décroissant, puis date récente.
 */
export function groupWatchlistByAccount(
  items: WatchlistItem[],
  profile?: SalesProfileForRelevance,
  types?: ReadonlySet<WatchlistTypeFacet>,
  rules: WatchlistRule[] = [],
): WatchlistAccountGroup[] {
  const byAccount = new Map<string, WatchlistItem[]>()
  for (const item of items) {
    const bucket = byAccount.get(item.accountId)
    if (bucket) bucket.push(item)
    else byAccount.set(item.accountId, [item])
  }

  const groups: WatchlistAccountGroup[] = []
  const compare = signalStrengthCompare(profile, types)
  for (const bucket of byAccount.values()) {
    const active = bucket.filter(item => !item.archived)
    // `sort` est stable : à force égale, l'ordre du flux serveur (pertinence) est gardé.
    const ordered = [...bucket].sort(compare)
    const latest = ordered[0]!
    const group: WatchlistAccountGroup = {
      accountId: latest.accountId,
      companyName: latest.companyName,
      sector: latest.sector,
      score: latest.score,
      latest,
      others: ordered.slice(1),
      decisionMaker: bucket.find(item => item.decisionMaker)?.decisionMaker ?? null,
      discardReason: signalDiscardReason(latest, profile),
      outOfTrade: isOutOfTrade(latest, profile),
      activeSignalCount: active.length,
      totalSignalCount: bucket.length,
      status: latest.status,
    }
    // #4088.3 — un compte sans AUCUNE raison à nommer sort de la vue par défaut (« Écartés »), il ne laisse pas
    // une cellule vide : « on n'affiche pas ce qu'on n'a pas ».
    if (group.discardReason === null && !hasNamedRankFact(group, rules)) group.discardReason = 'noReason'
    groups.push(group)
  }

  return groups.sort((a, b) => {
    const activeDelta = Number(b.activeSignalCount > 0) - Number(a.activeSignalCount > 0)
    if (activeDelta !== 0) return activeDelta
    // #4284.10 — un compte dont le signal de tête est hors métier passe après les autres.
    const tradeDelta = Number(a.outOfTrade === true) - Number(b.outOfTrade === true)
    if (tradeDelta !== 0) return tradeDelta
    const scoreDelta = (b.score ?? -1) - (a.score ?? -1)
    if (scoreDelta !== 0) return scoreDelta
    return signalTime(b.latest) - signalTime(a.latest)
  })
}

// The signal date is FREE TEXT from the IA ("2026", "juillet 2026", "3 days
// ago"), so `Date.parse` returns NaN on the very values that describe the
// FRESHEST signals. Sorting them as epoch 0 let a year-only "2026" (→ 1 January)
// win the representative slot over a signal dated "3 days ago".
function signalTime(item: WatchlistItem): number {
  return signalSortMs(parseSignalDate(item.signalDate)) ?? 0
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Filtres de la page unique (restitution V2 §11)                            */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * #4088.5 — TROIS filtres, pas cinq (Louis 12/10/2026) :
 *  - `todo` « À traiter » (le défaut) — le signal n'a encore déclenché aucune
 *    action et n'est pas résolu ;
 *  - `priority` « Mes comptes prioritaires » — la bande GO du score de compte ;
 *  - `rules` « Selon mes règles » — le signal correspond à une règle personnelle.
 * Le statut de fraîcheur (nouveau / à analyser / à requalifier) reste dans le
 * modèle (`WatchlistItem.status`, raison de rang) mais n'est plus une facette.
 *
 * Entre filtres : ET. Aucun filtre actif = tout, dans l'ordre de priorité déjà
 * calculé par `groupWatchlistByAccount`. Un filtre dont le compte vaut 0 ne
 * s'affiche pas (« on n'affiche pas ce qu'on n'a pas ») ET ne s'applique pas
 * (`effectiveFilters`) : une vue ne se vide jamais à cause d'un filtre invisible.
 */
export const WATCHLIST_FILTERS = ['todo', 'priority', 'rules'] as const
export type WatchlistFilterKey = (typeof WATCHLIST_FILTERS)[number]

/** Le filtre posé à l'arrivée : « À traiter » (#4088.5). */
export const WATCHLIST_DEFAULT_FILTERS: ReadonlySet<WatchlistFilterKey> = new Set<WatchlistFilterKey>(['todo'])

/**
 * Seuil du KPI « Prioritaires » — une seule définition pour le compteur et la
 * facette, et cette définition est celle du CONTRAT (GA-56).
 *
 * « Prioritaire » n'est pas un seuil de la Veille : c'est la bande GO du score
 * de compte. Le 7 était retapé ici, à trois lignes d'un `>= 7` qui l'était
 * aussi — donc « une seule définition » ne l'était que dans ce fichier.
 */
const PRIORITY_SCORE = ACCOUNT_SCORE_GO_MIN

/**
 * Un compte SANS score n'est pas prioritaire — mais il n'est pas « à zéro ».
 *
 * ⚠️ Le `(item.score ?? 0) >= …` qui vivait ici rendait le bon verdict pour la
 * mauvaise raison : il inventait une valeur pour la comparer. Le motif est
 * INTERDIT dans ce dépôt (GA-18/GA-19), et il l'est parce qu'il se propage —
 * le jour où quelqu'un affiche la valeur au lieu de la comparer, l'écran écrit
 * « 0 » sur ce que personne n'a mesuré. La question à se poser :
 * *si cette valeur est absente, « 0 » est-il VRAI ?* Ici, non.
 */
function isPriorityScore(score: number | null | undefined): boolean {
  return typeof score === 'number' && score >= PRIORITY_SCORE
}

/** #4088.5 — « à traiter » : aucune action déclenchée, signal toujours présent dans l'analyse. */
function isToTreat(item: WatchlistItem): boolean {
  return item.triggeredActionLabel === null && !item.resolved
}

function matchesFacet(item: WatchlistItem, facet: WatchlistFilterKey, rules: WatchlistRule[]): boolean {
  if (facet === 'priority') return isPriorityScore(item.score)
  if (facet === 'rules') return matchWatchlistRules(item, rules).length > 0
  return isToTreat(item)
}

export function filterWatchlistItems(
  items: WatchlistItem[],
  options: { active: ReadonlySet<WatchlistFilterKey>; query: string; rules: WatchlistRule[] },
): WatchlistItem[] {
  const { active, query, rules } = options
  const normalizedQuery = query.trim().toLocaleLowerCase('fr')
  const facets = WATCHLIST_FILTERS.filter(key => active.has(key))

  return items.filter(item => {
    if (!facets.every(key => matchesFacet(item, key, rules))) return false
    if (!normalizedQuery) return true
    const searchable = `${item.companyName} ${item.sector} ${item.signalLabel}`.toLocaleLowerCase('fr')
    return searchable.includes(normalizedQuery)
  })
}

/**
 * Combien de COMPTES chaque filtre retiendrait — affiché sur la puce pour que le
 * commercial sache AVANT de cliquer ce qu'il y trouvera. Une ligne = un compte
 * (#4088.2) : on compte les comptes, pas les signaux. Compté sur les items déjà
 * restreints par la recherche, sans tenir compte des autres filtres.
 */
export function countWatchlistFacets(
  items: WatchlistItem[],
  options: { query: string; rules: WatchlistRule[]; profile?: SalesProfileForRelevance },
): Record<WatchlistFilterKey, number> {
  const base = filterWatchlistItems(items, { active: new Set(), query: options.query, rules: options.rules })
  const counts = {} as Record<WatchlistFilterKey, number>
  for (const facet of WATCHLIST_FILTERS) {
    // #4088.6 — le compteur compte les LIGNES affichables (même source que la liste) : un compte
    // dont le signal le plus fort est écarté va sous « Écartés (N) », il ne gonfle pas la puce.
    const kept = base.filter(item => matchesFacet(item, facet, options.rules))
    counts[facet] = groupWatchlistByAccount(kept, options.profile, undefined, options.rules).filter(
      group => group.discardReason === null,
    ).length
  }
  return counts
}

/**
 * #4088.5 — les filtres réellement APPLIQUÉS : ceux que le commercial a posés ET
 * dont le compte n'est pas 0 (un filtre invisible ne s'applique pas).
 */
export function effectiveFilters(
  active: ReadonlySet<WatchlistFilterKey>,
  counts: Record<WatchlistFilterKey, number>,
): Set<WatchlistFilterKey> {
  return new Set([...active].filter(facet => counts[facet] > 0))
}

/**
 * #4088.10 — filtrer par TYPE de signal (Louis 13/10/2026). Les puces de type sont les cinq
 * besoins d'ESN de `signalNeedKind` + « Autres » (signal ni classé ni écarté). UNE classification
 * (GA-26) : `itemNeedKind`. Un signal ÉCARTÉ (`signalDiscardReason`) n'est d'aucun type : il
 * reste sous « Écartés (N) », il ne gonfle pas une puce.
 * Entre types : OU. Avec le filtre d'intention : ET. Une puce à 0 ne s'affiche pas ni ne s'applique.
 */
export const WATCHLIST_TYPE_FACETS = ['hiring', 'mna', 'exec', 'funding', 'tender', 'other'] as const
export type WatchlistTypeFacet = (typeof WATCHLIST_TYPE_FACETS)[number]

export function signalTypeFacet(
  item: Pick<WatchlistItem, 'signalType' | 'signalLabel'>,
  profile: SalesProfileForRelevance | undefined,
): WatchlistTypeFacet | null {
  if (signalDiscardReason(item, profile)) return null
  return itemNeedKind(item) ?? 'other'
}

/**
 * #4088.10 — les types de chaque COMPTE. « Autres » ne vaut que pour un compte dont AUCUN signal
 * n'a l'un des cinq types nommés : sinon la puce valait le total (78 sur 78 en prod le 13/10).
 */
function accountTypeFacets(
  items: readonly WatchlistItem[],
  profile: SalesProfileForRelevance | undefined,
): Map<string, Set<WatchlistTypeFacet>> {
  const byAccount = new Map<string, Set<WatchlistTypeFacet>>()
  for (const item of items) {
    const facet = signalTypeFacet(item, profile)
    if (!facet) continue
    const bucket = byAccount.get(item.accountId) ?? new Set<WatchlistTypeFacet>()
    bucket.add(facet)
    byAccount.set(item.accountId, bucket)
  }
  for (const facets of byAccount.values()) {
    if (facets.size > 1) facets.delete('other')
  }
  return byAccount
}

/** Combien de COMPTES ont ≥ 1 signal de chaque type (une ligne = un compte). */
export function countWatchlistTypeFacets(
  items: readonly WatchlistItem[],
  profile: SalesProfileForRelevance | undefined,
): Record<WatchlistTypeFacet, number> {
  const counts = {} as Record<WatchlistTypeFacet, number>
  for (const facet of WATCHLIST_TYPE_FACETS) counts[facet] = 0
  for (const facets of accountTypeFacets(items, profile).values()) {
    for (const facet of facets) counts[facet] += 1
  }
  return counts
}

/** Les types réellement APPLIQUÉS : posés ET dont le compte n'est pas 0. */
export function effectiveTypeFacets(
  active: ReadonlySet<WatchlistTypeFacet>,
  counts: Record<WatchlistTypeFacet, number>,
): Set<WatchlistTypeFacet> {
  return new Set([...active].filter(facet => counts[facet] > 0))
}

/**
 * Garde les COMPTES qui ont ≥ 1 signal d'un des types actifs — avec TOUS leurs signaux : le
 * « +N autres » compte le reste, et `groupWatchlistByAccount(…, types)` met en tête le signal
 * le plus fort DE CE TYPE.
 */
export function filterWatchlistByTypes(
  items: readonly WatchlistItem[],
  types: ReadonlySet<WatchlistTypeFacet>,
  profile: SalesProfileForRelevance | undefined,
): WatchlistItem[] {
  if (types.size === 0) return [...items]
  const keep = new Set<string>()
  for (const [accountId, facets] of accountTypeFacets(items, profile)) {
    if ([...facets].some(facet => types.has(facet))) keep.add(accountId)
  }
  return items.filter(item => keep.has(item.accountId))
}

function statusFromDate(value: string): WatchlistStatus {
  const timestamp = signalSortMs(parseSignalDate(value))
  if (timestamp === null) return 'review'

  const ageDays = (Date.now() - timestamp) / (24 * 60 * 60 * 1000)
  if (ageDays <= 30) return 'new'
  if (ageDays > 90) return 'follow-up'
  return 'review'
}

/**
 * « Pourquoi Bellum me montre ça ? » (restitution V2 §11).
 *
 * Le panneau affichait une phrase STATIQUE, identique pour tous les signaux — donc
 * sans information. Aucun champ « raison » n'existe côté données ; on la dérive
 * donc de ce qu'on a réellement : la priorité du compte (score), la fraîcheur du
 * signal, et son type. Rien d'inventé : chaque ligne cite le fait qui la produit,
 * et un signal sans aucun de ces trois éléments ne reçoit aucune ligne plutôt
 * qu'une justification creuse.
 */
export function buildSignalReasons(item: WatchlistItem, now: number = Date.now()): string[] {
  const reasons: string[] = []

  if (item.score != null) {
    reasons.push(
      // « Compte prioritaire » veut dire GO, et GO est une bande du contrat
      // (GA-56) — pas un 7 retapé ici.
      item.score >= ACCOUNT_SCORE_GO_MIN
        ? i18n.t('watchlist:why.priorityAccount', { score: item.score })
        : i18n.t('watchlist:why.scoredAccount', { score: item.score }),
    )
  }

  if (item.archived) {
    reasons.push(i18n.t('watchlist:why.archived'))
  } else {
    const ms = signalSortMs(parseSignalDate(item.signalDate), now)
    const days = ms == null ? null : Math.max(0, Math.floor((now - ms) / (24 * 60 * 60 * 1000)))
    // ⚠️ ZÉRO JOUR N'EST PAS « il y a 0 jour ». Le français n'a pas de règle de
    // pluriel pour zéro : i18next choisit la forme SINGULIÈRE, et l'écran
    // écrivait « Signal détecté il y a 0 jour » — mesuré en production le
    // 05/09/2026. La phrase juste est « aujourd'hui », et elle mérite sa clé.
    if (days === 0) reasons.push(i18n.t('watchlist:why.freshToday'))
    else if (days != null && days <= 30) reasons.push(i18n.t('watchlist:why.fresh', { count: days }))
    else if (days != null) reasons.push(i18n.t('watchlist:why.dated', { count: days }))
  }

  const kind = itemNeedKind(item)
  if (kind) reasons.push(i18n.t(`watchlist:why.${WHY_TYPE_KEY[kind]}`))

  return reasons
}

/**
 * « Historique de signal » (restitution V2 §11) : première détection,
 * changements, fraîcheur, résolution.
 *
 * Chaque ligne cite un fait PERSISTÉ (table `signal_history`) — jamais une date
 * déduite. Un signal sans historique (compte jamais ré-analysé depuis la mise en
 * place) ne produit aucune ligne : la Veille dit alors ce qu'elle sait, rien de
 * plus. Une première détection ancrée par le backfill (`firstDetectionExact =
 * false`) se lit « suivi depuis le … » : on sait que le signal était DÉJÀ là,
 * pas qu'il est apparu ce jour-là.
 */
export function buildSignalHistoryLines(item: WatchlistItem): string[] {
  const lines: string[] = []

  if (item.firstDetectedAt) {
    const date = formatHistoryDate(item.firstDetectedAt)
    if (date) {
      lines.push(
        item.firstDetectionExact
          ? i18n.t('watchlist:history.firstDetected', { date })
          : i18n.t('watchlist:history.trackedSince', { date }),
      )
    }
  }

  if (item.changeCount > 0) {
    lines.push(i18n.t('watchlist:history.changed', { count: item.changeCount }))
  }

  if (item.resolved) {
    const date = item.resolvedAt ? formatHistoryDate(item.resolvedAt) : null
    lines.push(date ? i18n.t('watchlist:history.resolvedOn', { date }) : i18n.t('watchlist:history.resolved'))
  } else if (item.lastSeenAt) {
    const date = formatHistoryDate(item.lastSeenAt)
    if (date) lines.push(i18n.t('watchlist:history.lastSeen', { date }))
  }

  // #3206.2 (partiel, épopée #3240) — « Marquer vérifié ». `null` tant que
  // personne n'a cliqué : l'écran ne l'affiche alors pas, jamais une
  // vérification devinée.
  if (item.lastVerifiedAt) {
    const date = formatHistoryDate(item.lastVerifiedAt)
    if (date) lines.push(i18n.t('watchlist:history.verified', { date }))
  }

  return lines
}

/**
 * Bonus §11 — « correspond à votre règle ». Les règles PERSONNELLES de veille du
 * commercial (secteur/techno/compte/besoin/personne) que CE signal matche, par
 * comparaison DÉTERMINISTE (normalisée, sans IA) : la valeur de la règle est
 * cherchée dans le nom du compte, le secteur, le libellé et le type du signal.
 * Aucune règle ne matche ⇒ rien n'est tagué (jamais de correspondance inventée).
 */
export function matchWatchlistRules(item: WatchlistItem, rules: WatchlistRule[]): WatchlistRule[] {
  return rules.filter(rule =>
    watchlistRuleMatches(rule.value, item.companyName, item.sector, item.signalLabel, item.signalType),
  )
}

/** Un timestamp ISO produit par Bellum (pas la prose de l'IA) : on peut le
 *  formater à la journée sans risque d'élargir une précision inventée. */
function formatHistoryDate(iso: string): string | null {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const locale = i18n.language === 'fr' ? 'fr-FR' : 'en-GB'
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}

/**
 * #4088.2 — ce qu'un TYPE de signal dit d'un besoin, côté ESN. Liste volontairement
 * courte : on ne commente que les types dont la lecture commerciale est établie.
 * Les types de l'analyse (`research.py`) : recrutement, acquisition, nomination,
 * levee_fonds, investissement, appel_offres, projet… ; un type inconnu n'a AUCUNE
 * lecture (jamais de texte inventé).
 */
type SignalNeedKind = 'hiring' | 'mna' | 'exec' | 'funding' | 'tender'

const SIGNAL_NEED_NEEDLES: ReadonlyArray<readonly [string, SignalNeedKind]> = [
  ['recrut', 'hiring'],
  ['emploi', 'hiring'],
  ['job', 'hiring'],
  ['hiring', 'hiring'],
  ['levée', 'funding'],
  ['levee', 'funding'],
  ['funding', 'funding'],
  ['croissance', 'funding'],
  ['investissement', 'funding'],
  ['nomination', 'exec'],
  ['dirigeant', 'exec'],
  ['marché', 'tender'],
  ['appel', 'tender'],
  ['contrat', 'tender'],
  ['tender', 'tender'],
  ['projet', 'tender'],
  ['acquisition', 'mna'],
  ['rachat', 'mna'],
  ['fusion', 'mna'],
]

/** Les clés i18n historiques des phrases « budget » (`why.type*`). */
const WHY_TYPE_KEY: Record<SignalNeedKind, string> = {
  hiring: 'typeHiring',
  funding: 'typeFunding',
  exec: 'typeExec',
  tender: 'typeTender',
  mna: 'typeMna',
}

/**
 * #4088.11 — Les types d'ACQUISITION / FINANCEMENT sont ambigus : l'IA range sous « acquisition »
 * ou « croissance » une phrase qui n'annonce aucun rachat (« redessine ses priorités ») ou un
 * simple chiffre d'affaires (« en hausse de 15 % »). Quand le libellé est connu, un type
 * `mna` / `funding` ne vaut que si le libellé porte un déclencheur NON ambigu. Les types
 * « levée » / « funding » sont déjà explicites : ils n'ont pas besoin du libellé.
 */
const MNA_TRIGGER_RE =
  /(?:^|[^\p{L}])(?:rach[èe]te(?:nt)?|rachat|rachet[ée]e?s?|acquiert|acquisition\s+de|fusion\s+avec|fusionne(?:nt)?|absorbe|absorption|OPA|OPE)(?![\p{L}])/iu
// #4088.11 — un « programme de rachat d'actions » est de la finance de marché, pas un rachat d'entreprise.
const SHARE_BUYBACK_RE = /rach\p{L}*\s+(?:de\s+(?:ses\s+|ses\s+propres\s+)?|d.)actions/giu
const FUNDING_TRIGGER_RE =
  /(?:^|[^\p{L}])(?:l[èe]ve(?:nt)?|lev[ée]e\s+de\s+fonds|tour\s+de\s+table|s[ée]rie\s+[abc]|financement)(?![\p{L}])/iu
// #4283.1 — déclencheur de CHANGEMENT DE DIRIGEANT : le type « nomination » ne vaut « Nouveau dirigeant » que si le libellé le porte.
const EXEC_TRIGGER_RE =
  /(?:^|[^\p{L}])(?:nomm[ée]e?s?|nominations?|rejoin(?:t|dre|nent)|succ[èe]de(?:nt)?|succession|prend(?:ra)?\s+la\s+t[êe]te|arriv[ée]es?|d[ée]parts?|quitte|DG|PDG|DSI|CTO|CEO|DAF|CIO|CFO|directeurs?|directrices?)(?![\p{L}])/iu
const EXEC_TYPE_RE = /nomination|dirigeant/i
const EXPLICIT_FUNDING_TYPE_RE = /lev[ée]e|funding/i
// #4088.11 — déclencheur d'APPEL D'OFFRES : marché + attribution, consultation, RFP/RFI, AO.
const TENDER_TRIGGER_RE =
  /appels?\s+d.offres|\bRFP\b|\bRFI\b|\bAO\b|\bconsultations?\b|\btender\b|\bmarch[ée]s?\s+publics?|(?<![\p{L}])march[ée]s?(?![\p{L}])[^.]{0,40}\battribu|\battribu[\p{L}]*[^.]{0,40}march[ée]s?(?![\p{L}])/iu
const EXPLICIT_TENDER_TYPE_RE = /appel|tender|rfp/i
// #4088.11 — l'absence n'est pas un signal : « Aucune offre d'emploi… », « Aucune actualité… ».
const NO_SIGNAL_RE = /\baucune?s?\s+(?:offres?|actualit[ée]s?|signal|signaux|information|donn[ée]es?|r[ée]sultats?)/i

/**
 * Le besoin d'ESN que porte un signal, ou `null` (non mappé : pas de phrase). Le TYPE structuré
 * prime ; le libellé (optionnel) ne fait que DÉMENTIR un type ambigu (rachat, croissance) ou
 * servir de repli, avec des motifs non ambigus (#4088.11).
 */
export function signalNeedKind(signalType: string, signalLabel?: string): SignalNeedKind | null {
  const type = signalType.toLowerCase()
  const byType = SIGNAL_NEED_NEEDLES.find(([needle]) => type.includes(needle))?.[1] ?? null
  if (signalLabel === undefined) return byType
  // #4088.11 — « Aucune offre… » n'est PAS un signal : aucun besoin, quel que soit le type.
  if (NO_SIGNAL_RE.test(signalLabel)) return null
  // #4088.11 — un marché attribué / une consultation est un appel d'offres, même rangé sous
  // « acquisition » (CH de Valenciennes) ; l'inverse n'est pas vrai (voir plus bas).
  if (byType !== 'hiring' && byType !== 'exec' && TENDER_TRIGGER_RE.test(signalLabel)) return 'tender'
  // #4088.11 — types AMBIGUS (projet, contrat, marché) : un plan stratégique n'est pas un appel
  // d'offres. Ils ne valent « appel d'offres » que si le libellé porte le déclencheur ci-dessus.
  if (byType === 'tender' && !EXPLICIT_TENDER_TYPE_RE.test(type)) return null
  const mnaLabel = signalLabel.replace(SHARE_BUYBACK_RE, ' ')
  // #4283.1 — un type « nomination » sans changement de dirigeant dans le libellé n'est pas un « Nouveau dirigeant ».
  if (byType === 'exec') return EXEC_TRIGGER_RE.test(signalLabel) ? 'exec' : null
  if (byType === 'mna') return MNA_TRIGGER_RE.test(mnaLabel) ? 'mna' : null
  if (byType === 'funding') {
    return EXPLICIT_FUNDING_TYPE_RE.test(type) || FUNDING_TRIGGER_RE.test(signalLabel) ? 'funding' : null
  }
  if (byType !== null) return byType
  if (MNA_TRIGGER_RE.test(mnaLabel)) return 'mna'
  if (FUNDING_TRIGGER_RE.test(signalLabel)) return 'funding'
  return null
}

/** La classification d'un item — UN endroit (GA-26) : type + libellé. */
export function itemNeedKind(item: Pick<WatchlistItem, 'signalType' | 'signalLabel'>): SignalNeedKind | null {
  return signalNeedKind(item.signalType, item.signalLabel)
}

/**
 * #4088.2 — « POURQUOI ÇA COMPTE » : UNE phrase, ce que le fait veut dire pour une
 * ESN (besoin probable), dérivée du TYPE du signal. Aucune probabilité, aucun
 * pourcentage. Type inconnu ⇒ `null` : la cellule reste vide, jamais un texte inventé.
 */
export function buildNeedLine(item: Pick<WatchlistItem, 'signalType'> & { signalLabel?: string }): string | null {
  const kind = signalNeedKind(item.signalType, item.signalLabel)
  return kind ? i18n.t(`watchlist:need.${kind}`) : null
}

/**
 * #4088 (recette 15/10) — le type d'un signal, ou `''` quand la ligne n'en porte pas : `buildWatchlistItems`
 * remplace un type absent par le libellé de repli « Signal », que les phrases « Signal « {{type}} » »
 * recitaient (« Signal « Signal » »). Un repli n'est pas un type : il ne se cite pas.
 */
function citableSignalType(signalType: string): string {
  const type = signalType.trim()
  return type === i18n.t('watchlist:model.typeFallback') ? '' : type
}

/**
 * #4088.12 — « POURQUOI ÇA COMPTE » SANS CASE VIDE (recette prod 14/10 : 10 lignes sur 20
 * vides). Un besoin établi garde sa phrase ; sinon la ligne DIT pourquoi on la montre, avec
 * ce que la base porte déjà (type du signal, secteur) — jamais un besoin inventé, jamais rien.
 */
/**
 * #4088 (recette R16) — un type vide ou qui n'est que le mot « signal » ne dit rien de plus que
 * « signal » : l'entourer de guillemets écrivait « Signal « Signal » ». Il s'affiche seul.
 */
function isGenericSignalType(type: string): boolean {
  return /^(signal|signaux|signals|signal\s+détecté)$/i.test(type.trim())
}

export function buildWhyLine(item: Pick<WatchlistItem, 'signalType' | 'sector'> & { signalLabel?: string }): string {
  const need = buildNeedLine(item)
  if (need) return need
  const type = citableSignalType(item.signalType)
  const sector = compactSector(item.sector)
  // Intégration 15/10 : le repli « Signal » (#4088, decisions) et un type générique (#4088, R16) se lisent
  // tous deux « Signal » seul — jamais entre guillemets.
  const typeLabel = isGenericSignalType(item.signalType)
    ? i18n.t('watchlist:need.fallbackSignalBare')
    : type
      ? i18n.t('watchlist:need.fallbackSignal', { type })
      : ''
  const head = [typeLabel, sector].filter(Boolean).join(' · ')
  return head ? i18n.t('watchlist:need.fallback', { head }) : i18n.t('watchlist:need.fallbackBare')
}

/**
 * #3901.w (décision Louis 09/10/2026) — /mes-cibles suit le profil DÉCLARÉ comme Découvrir :
 * mêmes fonctions (`discover-hiring-domain`, GA-26). Le libellé AFFICHÉ porte le domaine ;
 * `signalLabel` n'est jamais muté (recherche, règles, « vérifier »). Profil vide : libellés
 * d'avant + la ligne qui renvoie vers Mon profil.
 *
 * #4088.7 — l'offre HORS domaine n'est plus « rangée en fin » : elle est ÉCARTÉE de la vue
 * par défaut (`signalDiscardReason`), sous « Écartés (N) », jamais supprimée. Le libellé est
 * posé sur CHAQUE signal (le « +N autres » lit les mêmes libellés que la ligne).
 */
export function applyHiringDomain(
  items: readonly WatchlistItem[],
  profile: SalesProfileForRelevance | undefined,
): { items: WatchlistItem[]; notice: HiringDomainNotice | null } {
  const typed = hiringTyped
  return {
    items: items.map(item => ({ ...item, displayLabel: hiringDisplayLabel(typed(item), profile) })),
    notice: hiringNoticeForSignals(items.map(typed), profile),
  }
}

/**
 * #4088.7 — POURQUOI UN SIGNAL EST ÉCARTÉ de la vue par défaut (Louis 12/10/2026) : UN
 * prédicat (GA-26), jamais recopié dans la vue.
 *  - `internship` : offre de stage / d'alternance — pas un besoin d'ESN ;
 *  - (retiré le 21/10, #4284.10) `offDomain` : l'offre hors métier n'est plus écartée, elle est rangée plus bas et marquée ;
 *  - `general` : presse générale / macro, résultats financiers périodiques — SANS
 *    déclencheur commercial. Un type qui porte un besoin d'ESN (`signalNeedKind`) n'est
 *    jamais « général » : un signal de type inconnu mais non « presse » reste affiché,
 *    sans phrase — on n'écarte que ce qu'on sait être du bruit.
 *  - `noReason` (#4088.3) : au niveau du COMPTE, aucune raison de rang n'existe (`hasNamedRankFact`)
 *    — pas de cellule vide.
 * Rien n'est supprimé : « Écartés (N) », en bas, les garde lisibles.
 */
type DiscardReason = 'internship' | 'general' | 'noReason'

const PRESS_TYPE_RE = /\b(?:press\w*|actualit\w*|news|articles?|m[ée]dias?)\b/i
const INTERNSHIP_RE = /\b(stages?|stagiaires?|alternances?|alternants?|apprentis(?:sage)?|internships?|interns?)\b/i
const GENERAL_RE =
  /\b(?:presse|macro\w*|conjoncture|inflation|earnings|bilan)\b|\br[ée]sultats?\s+(?:du\s+|de\s+l.)?(?:T[1-4]|S[12]|H[12])\b|r[ée]sultats?\s+(?:financiers?|annuels?|semestriels?|trimestriels?|publi)|chiffre d.affaires|comptes? annuels?|(?:premier|second|deuxi[èe]me|1er|2e|h1|h2)\s+semestre|(?:premier|deuxi[èe]me|troisi[èe]me|quatri[èe]me|[1-4]er|[2-4]e)\s+trimestre/i

/**
 * #4088.11 (Louis 15/10) — un résultat périodique n'est écarté que s'il ne porte AUCUN chiffre marquant :
 * variation ≥ 10 % (hausse/baisse/recul/chute/+x %), plan d'économies, avertissement sur résultats.
 */
// #4088.11 — chiffre marquant
const MARKING_FIGURE_RE =
  /plans?\s+d.[ée]conomies|avertissement\s+sur\s+(?:r[ée]sultats|ses\s+r[ée]sultats)|profit\s+warning|\b(?:hausse|baisse|recul\w*|chute|bond|croissance|progress\w*|diminu\w*|augment\w*|plonge\w*|s.effondre\w*)\b[^%]{0,24}?(\d+(?:[.,]\d+)?)\s*%|([+\-−–]\s?\d+(?:[.,]\d+)?)\s*%/iu

function hasMarkingFigure(text: string): boolean {
  const m = MARKING_FIGURE_RE.exec(text)
  if (!m) return false
  const raw = m[1] ?? m[2]
  if (raw === undefined) return true // plan d'économies / avertissement : pas de seuil chiffré
  const value = Math.abs(Number.parseFloat(raw.replace(/[^\d.,]/g, '').replace(',', '.')))
  return value >= 10
}

export function signalDiscardReason(
  item: Pick<WatchlistItem, 'signalType' | 'signalLabel'>,
  profile: SalesProfileForRelevance | undefined,
): DiscardReason | null {
  const typed = hiringTyped(item)
  const text = `${item.signalType} ${item.signalLabel}`
  if (NO_SIGNAL_RE.test(item.signalLabel ?? '')) return 'general' // #4088.11 — « Aucune offre… »
  if (isHiringSignal(typed)) {
    if (INTERNSHIP_RE.test(text)) return 'internship'
    return null // #4284.10 — l'offre hors métier n'est jamais écartée : `isOutOfTradeHiring` la range plus bas et la marque
  }
  // #4283.1 — type « nomination / dirigeant » dont le libellé ne porte aucun changement de dirigeant : bruit.
  if (EXEC_TYPE_RE.test(item.signalType) && signalNeedKind(item.signalType, item.signalLabel) === null) return 'general'
  // V4-CORRECTIFS-C 4283.1 — « presse seule » : un signal TYPÉ presse/actualité sans déclencheur commercial
  // (`signalNeedKind` nul) est du bruit, même quand son libellé ne contient aucun des mots de `GENERAL_RE`.
  if (
    signalNeedKind(item.signalType, item.signalLabel) === null &&
    PRESS_TYPE_RE.test(item.signalType) &&
    !MNA_TRIGGER_RE.test((item.signalLabel ?? '').replace(SHARE_BUYBACK_RE, ' ')) &&
    !FUNDING_TRIGGER_RE.test(item.signalLabel ?? '')
  )
    return 'general'
  if (signalNeedKind(item.signalType, item.signalLabel) === null && GENERAL_RE.test(text)) {
    // #4088.11 — rachat / fusion toujours gardés ; résultats périodiques gardés s'ils portent un chiffre marquant.
    if (MNA_TRIGGER_RE.test((item.signalLabel ?? '').replace(SHARE_BUYBACK_RE, ' ')) || hasMarkingFigure(text))
      return null
    return 'general'
  }
  return null
}

/**
 * #4088.3 — « on n'affiche pas ce qu'on n'a pas » : une ligne dont le signal de tête n'a NI libellé
 * NI type n'a rien d'exploitable — elle sort de la vue plutôt que d'afficher du vide.
 */
export function hasUsableSignal(item: Pick<WatchlistItem, 'signalLabel' | 'signalType'>): boolean {
  return item.signalLabel.trim().length > 0 || item.signalType.trim().length > 0
}

/** Le prénom et l'initiale du nom, pour une phrase d'action : « Marie Durand » → « Marie D. ». */
export function shortPersonName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  const first = parts[0]
  const last = parts.length > 1 ? parts[parts.length - 1] : undefined
  if (!first) return ''
  return last ? `${first} ${last.charAt(0).toUpperCase()}.` : first
}

/**
 * #4088.4 — « PROCHAINE ACTION » : un verbe + une personne, selon le type du signal.
 * Recrutement → « Proposer un profil à … » ; nomination, levée → « Écrire à … » ;
 * rachat, appel d'offres, type inconnu → « Appeler … ». Aucun contact connu → « Identifier
 * le décideur ». C'est un libellé : rien n'est envoyé (le copilote prépare, le commercial envoie).
 */
export function buildNextActionLabel(group: Pick<WatchlistAccountGroup, 'latest' | 'decisionMaker'>): string {
  const person = group.decisionMaker ? shortPersonName(group.decisionMaker.name) : ''
  if (!person) return i18n.t('watchlist:nextAction.identify')
  const kind = itemNeedKind(group.latest)
  const verb = kind === 'hiring' ? 'proposeProfile' : kind === 'exec' || kind === 'funding' ? 'write' : 'call'
  return i18n.t(`watchlist:nextAction.${verb}`, { name: person })
}

/**
 * #4088.3 — la ligne a-t-elle UN fait à nommer ? Une raison de rang, une date de détection, ou un type de
 * signal lisible (ni le repli « Signal », ni un type générique). Sans aucun des trois, la ligne ne dirait que
 * « Signal » : elle sort de la vue par défaut (`noReason`) plutôt que d'afficher un mot sans contenu.
 */
function hasNamedRankFact(group: WatchlistAccountGroup, rules: WatchlistRule[]): boolean {
  if (buildAccountRankReasons(group, rules).length > 0) return true
  const { latest } = group
  if (signalSortMs(parseSignalDate(latest.signalDate), Date.now()) != null) return true
  return citableSignalType(latest.signalType) !== '' && !isGenericSignalType(latest.signalType)
}

/**
 * #4088.3 — la raison de rang d'une ligne, TOUJOURS lisible : les raisons de `buildAccountRankReasons`,
 * et à défaut un fait du signal de tête (son type + sa fraîcheur). Jamais un score nu, jamais une
 * phrase inventée ; un signal sans type ni date lisible ne dit rien (`[]`).
 */
export function buildAccountRankLine(
  group: WatchlistAccountGroup,
  rules: WatchlistRule[],
  now: number = Date.now(),
): string[] {
  const reasons = buildAccountRankReasons(group, rules)
  if (reasons.length > 0) return reasons
  const { latest } = group
  const type = citableSignalType(latest.signalType)
  const ms = signalSortMs(parseSignalDate(latest.signalDate), now)
  const days = ms == null ? null : Math.max(0, Math.floor((now - ms) / (24 * 60 * 60 * 1000)))
  const parts: string[] = []
  if (isGenericSignalType(latest.signalType)) parts.push(i18n.t('watchlist:rank.lastSignalBare'))
  else if (type) parts.push(i18n.t('watchlist:rank.lastSignal', { type }))
  if (days === 0) parts.push(i18n.t('watchlist:rank.detectedToday'))
  else if (days != null) parts.push(i18n.t('watchlist:rank.detected', { count: days }))
  return parts
}

/**
 * #4088.3 — la RAISON DE RANG d'une ligne, en clair, 3 au plus : « Compte prioritaire ·
 * 3 signaux ce mois-ci · correspond à ta règle X ». Mêmes prédicats que les raisons
 * `why.*` du détail (priorité = bande GO du contrat, fraîcheur = statut `new`, règles =
 * `matchWatchlistRules`) — jamais un score nu. Le rôle change l'ordre, jamais le contenu.
 */
export function buildAccountRankReasons(group: WatchlistAccountGroup, rules: WatchlistRule[]): string[] {
  const reasons: string[] = []
  const signals = [group.latest, ...group.others]
  if (isPriorityScore(group.score)) reasons.push(i18n.t('watchlist:rank.priority'))
  const { thisMonth } = signalCountsOf(group)
  if (thisMonth > 0) reasons.push(i18n.t('watchlist:rank.signalsThisMonth', { count: thisMonth }))
  const rule = signals.flatMap(item => matchWatchlistRules(item, rules))[0]
  if (rule) reasons.push(i18n.t('watchlist:rank.rule', { rule: rule.value }))
  return reasons.slice(0, 3)
}

/**
 * #4072 — LES chiffres d'une ligne de la Watchlist, lus sur UNE seule liste (celle que la ligne déplie) :
 * `total` ⊇ `thisMonth` (non archivés, statut `new` = moins de 30 jours) ⊇ `hiringThisMonth`. « N signaux ce
 * mois-ci », « +N autres » et « Ne signal de recrutement en 30 jours » en dérivent : ils ne se contredisent plus.
 */
export function signalCountsOf(group: Pick<WatchlistAccountGroup, 'latest' | 'others'>): {
  total: number
  others: number
  thisMonth: number
  hiringThisMonth: number
} {
  const signals = [group.latest, ...group.others]
  const window = signals.filter(item => !item.archived && item.status === 'new')
  return {
    total: signals.length,
    others: group.others.length,
    thisMonth: window.length,
    hiringThisMonth: window.filter(item => itemNeedKind(item) === 'hiring').length,
  }
}

/**
 * #4072 — la récurrence servie par `GET /account-facts/recurrence` (historique + signaux courants) peut
 * compter autre chose que la ligne affichée. Le rang montré est celui de la LISTE de la ligne : recrutement
 * → les recrutements de la fenêtre ; autre nature → jamais plus que la fenêtre. Moins de 2 : aucune ligne.
 */
export function reconcileRecurrence(
  recurrence: SignalRecurrence | undefined,
  group: Pick<WatchlistAccountGroup, 'latest' | 'others'>,
): SignalRecurrence | undefined {
  if (!recurrence) return undefined
  const counts = signalCountsOf(group)
  const count = recurrence.kind === 'hiring' ? counts.hiringThisMonth : Math.min(recurrence.count, counts.thisMonth)
  return count >= 2 ? { ...recurrence, count } : undefined
}

/**
 * #4437.5 — ce que l'écran dit du rattachement d'une offre : ses compétences et sa famille métier, ou
 * « non classé » quand l'intitulé ne nomme rien. `null` = rien n'a été posé (collecte antérieure) : l'écran se tait.
 */
export function offerAttachmentView(
  attachment: WatchlistItem['offerAttachment'],
):
  | { unclassified: true }
  | { unclassified: false; factType: 'hiring' | 'project' | null; skills: string[]; family: string | null }
  | null {
  if (!attachment) return null
  if (attachment.status === 'unclassified' || (attachment.skills.length === 0 && !attachment.job_family)) {
    return { unclassified: true }
  }
  // #4437.5 — le TYPE de fait est le troisième rattachement ; « other » ne dit rien, il reste nu.
  const factType = attachment.fact_type === 'hiring' || attachment.fact_type === 'project' ? attachment.fact_type : null
  return { unclassified: false, factType, skills: attachment.skills, family: attachment.job_family }
}
