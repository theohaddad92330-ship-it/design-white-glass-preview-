import { knownCityCoordinates } from '@/lib/zones/commune-coordinates'
import {
  type ContactListItem,
  type CoverageLevel,
  type DiscoverEntityType,
  type DiscoverOriginCriteria,
  nafPrefixesForSectors,
  resolveContactLevel,
} from '@bellum/contracts'
import type {
  CityRadiusOption,
  DiscoverCandidate,
  HeadcountRange,
  CompanyAgeBucket,
  SignalSource,
  SiteBasisOption,
} from './discover-types'
import { NEED_PERIOD_ALL, type NeedNature, type NeedsPeriod } from './discover-needs-filters'
import { DEFAULT_CITY_RADIUS_KM, parseHeadcountLabel, SIGNAL_SOURCES } from './discover-types'
import { fitTierFor, isHighPotential } from './discover-ranking'
import { parseAmount, parseDepartments } from './discover-registry-vocab'
import { normalizeCompanyKey } from './discover-call-list'
import { ZONE_DEPARTMENTS, ZONE_REGIONS } from '@/lib/zones/zone-referential.data'
import type { DiscoverRequest } from '../hooks/useDiscoverSearch'
import {
  activeHeadcountRanges,
  activeSectors,
  buildRegistryQuery,
  buildSignalsQuery,
  DISCOVER_PAGE_SIZE,
  emptyRegistryFilters,
  emptySignalsFilters,
  HEADCOUNT_BOUNDS,
  isRegistryQueryRunnable,
  type RegistryFilters,
  type SignalsFilters,
} from './discover-query'

/* ------------------------------------------------------------------ */
/*  Rail de filtres UNIFIÉ (maquette p.20).                             */
/*                                                                     */
/*  Un seul jeu de filtres CROISABLES remplace les trois modes          */
/*  exclusifs. L'utilisateur coche à la fois une cible structurée       */
/*  (secteur(s) × zone × effectif × ancienneté), des signaux            */
/*  d'intention (recrutement, marché public…) ET un niveau de fit —     */
/*  tout se cumule dans UNE recherche.                                  */
/*                                                                     */
/*  Deux sources de vérité, une seule recherche :                       */
/*   - dès qu'un signal d'intention est coché, la liste part du SIGNAL   */
/*     (seule source capable de dire « qui BOUGE en ce moment ») ;       */
/*   - sinon elle part du REGISTRE (la cible structurée).               */
/*  Les critères que la source primaire n'exprime pas nativement sont    */
/*  appliqués sur les FAITS RÉELS déjà renvoyés (jamais fabriqués) —     */
/*  c'est ce qui rend « signal × secteur × fit » exprimable sans que le  */
/*  backend ait à tout croiser en une requête.                          */
/* ------------------------------------------------------------------ */

/** Niveau de fit demandé (« Relation & fit »). `any` = pas de contrainte. */
export const FIT_FILTERS = ['any', 'medium', 'high'] as const
export type FitFilter = (typeof FIT_FILTERS)[number]

/**
 * #3096 — les politiques de télétravail filtrables. `indifferent` est une
 * préférence de CANDIDAT (`consultants.remote_preference`), jamais une
 * politique d'EMPLOYEUR : absente ici, même choix que côté IA
 * (`remote_policy.py`).
 */
export const REMOTE_POLICY_FILTERS = ['sur_site', 'hybride', 'full_remote'] as const
export type RemotePolicy = (typeof REMOTE_POLICY_FILTERS)[number]

/**
 * #3528.3 (décision Louis 02/10/2026) — les niveaux de décision filtrables :
 * C-level, direction (N-1), manager (N-2) — le MÊME vocabulaire que la matrice
 * de couverture (`CoverageLevel`, `resolveContactLevel`, GA-26).
 */
export const DECISION_LEVEL_FILTERS = ['c_level', 'n1', 'n2'] as const
export type DecisionLevelFilter = (typeof DECISION_LEVEL_FILTERS)[number]

/** #3097 — les niveaux de séniorité filtrables (`DiscoverSignal.seniority`). */
export const SENIORITY_FILTERS = ['junior', 'confirme', 'senior'] as const
export type SeniorityFilter = (typeof SENIORITY_FILTERS)[number]

/**
 * #3226 (#3203.6) — les niveaux de delivery fit filtrables
 * (`DiscoverSignal.deliveryFit`) : PERSONNALISATION pour une ESN nearshore
 * (cibler les comptes compatibles, reculer les comptes qui excluent
 * explicitement le delivery externe). `'unknown'` reste un niveau
 * filtrable (nommé, pas caché) — cocher « non évalué » garde les comptes
 * sans preuve plutôt que de les exclure en silence.
 */
export const DELIVERY_FIT_FILTERS = ['compatible', 'potentially_compatible', 'unknown', 'incompatible'] as const
export type DeliveryFitFilter = (typeof DELIVERY_FIT_FILTERS)[number]

export interface UnifiedFilters {
  /* --- Votre cible (structuré) --- */
  /** Secteurs du vocabulaire PARTAGÉ (`APPLICATION_SECTORS`). Vide = aucune
   *  contrainte. Ils portent chacun leurs codes NAF, ce qui rend le critère
   *  interrogeable côté registre ET vérifiable côté écran en mode Signaux. */
  sectors: string[]
  nafCode: string
  department: string
  /** #2642.1 — PLUSIEURS régions cochées ensemble (IDF + Occitanie…). Vide =
   *  aucune contrainte. */
  region: string[]
  revenueMin: string
  revenueMax: string
  companyCategory: string[]
  legalForm: string
  city: string
  /** #2642.2 — un CERCLE autour de `city`. `'any'` = pas de contrainte. Sans
   *  effet SEUL — un rayon n'a pas de centre sans ville (voir
   *  `discover-query.ts`, `buildRegistryQuery`). */
  cityRadiusKm: CityRadiusOption
  /** #3983.2 — base de la zone département/région : siège ou implantation. */
  siteBasis: SiteBasisOption
  /** #3908 — plusieurs tranches cochables (cumul, union) ; voir `RegistryFilters.headcount`. */
  headcount: HeadcountRange[]
  age: CompanyAgeBucket
  freetext: string
  /**
   * #2165.27 — Exclusions. Secteurs du MÊME vocabulaire partagé que `sectors`,
   * mais retirés plutôt qu'ajoutés. Aucune source (registre gouv.fr, sources de
   * signal) n'exprime un critère négatif : le croisement se fait donc TOUJOURS
   * côté écran, dans les deux modes — voir `applyRailConstraints`.
   */
  excludeSectors: string[]
  /**
   * #2616.2 — écarte un candidat dont un signal `hiring` confirme un
   * employeur PUBLIC (`DiscoverSignal.publicEmployer === true`). Comme
   * `excludeSectors`, aucune source ne l'exprime en requête : croisé TOUJOURS
   * côté écran, dans les deux modes — voir `applyRailConstraints`. Posé par
   * le préréglage « comptes qui recrutent » (`discover-presets.ts`), jamais
   * exposé au rail : décision du lot #2616.2, voir son rapport.
   */
  excludePublicEmployers: boolean
  /**
   * #2616.1 — ne garde que les candidats dont un signal `hiring` confirme le
   * CDI (`DiscoverSignal.contractType === 'CDI'`). Comme `excludePublicEmployers`,
   * aucune source de signal ne l'exprime en requête filtrable côté serveur au
   * même niveau de vocabulaire que l'écran : croisé TOUJOURS côté écran, en
   * mode Signaux (voir `applyRailConstraints`). Contrairement à
   * `excludePublicEmployers` (une exclusion), c'est une INCLUSION : un
   * candidat sans signal `hiring` confirmé CDI sort de la vue filtrée.
   */
  cdiOnly: boolean
  /**
   * #4999 — ne garde que les offres dont le CONTRAT est freelance / mission / indépendant selon le champ réel de la
   * source (`DiscoverSignal.contractType === 'FREELANCE'`). Exclusif avec `cdiOnly`. Jamais déduit du texte libre.
   */
  freelanceOnly: boolean
  /** #5000 — comme `freelanceOnly`, sur `contractType === 'CDD'`. Exclusif avec les autres choix de contrat. */
  cddOnly: boolean
  /** #5000 — comme `freelanceOnly`, sur `contractType === 'INTERIM'` (l'intérim n'est plus compté freelance). */
  interimOnly: boolean
  /**
   * #3096 — ne garde que les candidats dont un signal `hiring` confirme une
   * des politiques cochées (`DiscoverSignal.remoteWorkPolicy`). Vide = pas de
   * contrainte. Comme `cdiOnly`, aucune source ne l'exprime en requête au
   * même niveau de vocabulaire que l'écran : croisé TOUJOURS côté écran, en
   * mode Signaux (voir `applyRailConstraints`). Un candidat sans signal
   * `hiring` évalué sort de la vue filtrée dès qu'une politique est cochée —
   * jamais compté comme « sur site » par défaut.
   */
  remotePolicies: RemotePolicy[]
  /**
   * #3097 — ne garde que les candidats dont un signal `hiring` confirme une
   * des séniorités cochées (`DiscoverSignal.seniority`). Même construction
   * que `remotePolicies` juste au-dessus.
   */
  seniorities: SeniorityFilter[]
  /**
   * #3528.3 — ne garde que les comptes ayant AU MOINS UN contact connu de
   * l'espace dont le niveau (déduit de l'intitulé collecté) est l'un de ceux
   * cochés. Croisé TOUJOURS côté écran, dans les deux modes : aucune source ne
   * l'exprime. Un compte sans contact connu, ou dont aucun niveau n'est
   * déterminable, ne passe pas — jamais un niveau inventé.
   */
  decisionLevels: DecisionLevelFilter[]
  /**
   * #3226 (#3203.6) — ne garde que les candidats dont un signal `hiring`
   * confirme un des niveaux de delivery fit cochés
   * (`DiscoverSignal.deliveryFit`). Même construction que `remotePolicies`
   * juste au-dessus.
   */
  deliveryFitFilter: DeliveryFitFilter[]
  /** #2165.28 — pile technique OBSERVÉE (mémoire marché), filtre SERVEUR. */
  technologiesObserved: string
  /** #2165.30 — au moins une ESN OBSERVÉE (mémoire marché), filtre SERVEUR.
   *  Doctrine c65 (GA-259) : `false` n'est jamais envoyé. */
  externalRecourseObserved: boolean
  /**
   * #4632 — « Famille de rôles observée » (« Data »), venue du panneau « Contexte marché observé » retiré :
   * un critère de la MÉMOIRE MARCHÉ seule. Il ne part jamais au registre ni aux signaux (ni `registryPart` ni
   * `signalsPart` ne le lisent) : la section « Marché observé » est retirée (Louis 31/10) ; le lot F le branche sur la recherche.
   */
  roleFamilyObserved: string
  /**
   * #4632 — « Écosystèmes liés à » une société de services OBSERVÉE (ex-champ `esn` du panneau). Même porte
   * que `roleFamilyObserved`. « Écosystèmes liés à X », jamais « ESN présente » ni « Clients de X » (#1626).
   */
  ecosystemObserved: string
  /** #5203 — période des besoins ('all' par défaut : aucune borne d'âge) et natures retenues (vide = toutes). */
  needsPeriod: NeedsPeriod
  needsNature: NeedNature[]
  /**
   * #2165.24 — Groupe / filiale. `'any'` = pas de contrainte. Comme les
   * exclusions ci-dessus, AUCUNE source (registre gouv.fr, sources de signal)
   * n'exprime ce critère : il se croise TOUJOURS côté écran, dans les deux
   * modes, sur le lien capitalistique déjà résolu pour les candidats qui sont
   * déjà des comptes possédés (voir `passesGroupRole`).
   */
  groupRole: 'any' | 'groupe' | 'filiale'
  /**
   * #4294.7 — « Déjà travaillées » (rubrique Relation) : ne garde que les comptes que l'espace a déjà travaillés
   * (relation ou mission passée). Seul `true` est un critère. Aucune source ne l'exprime : croisé côté écran, dans
   * les deux modes, en ET avec tous les autres (secteur compris) — un filtre ne se retire jamais pour en ajouter un.
   */
  workedOnly: boolean
  /**
   * #2291.2 — « recourt au freelance / à la régie », sur le modèle de contrat
   * OBSERVÉ (`DiscoverCandidate.contractModel`). DÉCISION Louis 19/09/2026 :
   * l'observer, jamais le déduire. Aucune source ne sait l'exprimer en
   * requête : croisé TOUJOURS côté écran, dans les deux modes. Seul `true`
   * contraint — décoché n'affirme jamais « n'y recourt pas ».
   */
  contractRecourseObserved: boolean
  /**
   * #4361.2 (décision Louis 20/10/2026) — retire les sociétés PROUVÉES cotées. Un INTERRUPTEUR
   * séparé, qui se combine avec n'importe quelle tranche (le préréglage « Middle market » le pose
   * avec 250 à 4 999 salariés). Agit côté recherche, REGISTRE seul : un candidat de signal ne
   * porte pas son SIREN prouvé — le rail le DIT (`rail.registryOnlyIdle`). Une société dont la
   * cotation n'est pas établie reste, et la réponse le dit (`listingFilter`).
   */
  excludeListed: boolean
  /* --- Performance & signaux (intention) --- */
  /** Sources d'intention cochées. VIDE = dimension non contraignante → la
   *  recherche part du registre, pas du signal. */
  signalSources: SignalSource[]
  sinceDays: number
  keywords: string
  /** Ce que la recherche doit lire (tome 4 §20.1) : les comptes finaux qui
   *  recrutent, les ESN qui débordent, ou les deux. N'a d'effet qu'en mode
   *  Signaux : le mode Registre cherche déjà par NAF explicite. */
  entityType: DiscoverEntityType
}

/** Rail vierge : aucun signal coché (recherche par registre). La fenêtre de
 *  fraîcheur reste à 90 j (le défaut des signaux). Le palier de fit vit hors du
 *  formulaire de recherche : c'est un affinage côté écran, appliqué en direct. */
export function emptyUnifiedFilters(): UnifiedFilters {
  const registry = emptyRegistryFilters()
  const signals = emptySignalsFilters()
  return {
    sectors: registry.sectors,
    nafCode: registry.nafCode,
    department: registry.department,
    region: registry.region,
    revenueMin: registry.revenueMin,
    revenueMax: registry.revenueMax,
    companyCategory: registry.companyCategory,
    legalForm: registry.legalForm,
    city: registry.city,
    cityRadiusKm: registry.cityRadiusKm,
    siteBasis: registry.siteBasis,
    headcount: registry.headcount,
    age: registry.age,
    freetext: registry.freetext,
    excludeSectors: [],
    excludePublicEmployers: false,
    cdiOnly: false,
    freelanceOnly: false,
    cddOnly: false,
    interimOnly: false,
    remotePolicies: [],
    seniorities: [],
    decisionLevels: [],
    deliveryFitFilter: [],
    technologiesObserved: registry.technologiesObserved,
    externalRecourseObserved: registry.externalRecourseObserved,
    roleFamilyObserved: '',
    ecosystemObserved: '',
    needsPeriod: NEED_PERIOD_ALL,
    needsNature: [],
    groupRole: 'any',
    workedOnly: false,
    contractRecourseObserved: false,
    excludeListed: registry.excludeListed,
    signalSources: [],
    sinceDays: signals.sinceDays,
    keywords: signals.keywords,
    entityType: signals.entityType,
  }
}

/** Sources d'intention réellement contraignantes (connues, dédupliquées). */
function activeSignalSources(filters: UnifiedFilters): SignalSource[] {
  return SIGNAL_SOURCES.filter(source => filters.signalSources.includes(source))
}

/**
 * Combien de critères du rail CONTRAIGNENT réellement la recherche.
 *
 * Sert au repli du panneau de filtres : replier des critères sans dire combien
 * sont posés, c'est fabriquer des résultats qu'on ne sait plus expliquer. On ne
 * compte donc que ce qui change la requête — la fenêtre de fraîcheur n'est un
 * critère que lorsqu'un signal est coché (sans signal elle ne s'applique à
 * rien), et une valeur laissée à son défaut n'en est pas un.
 */
export function countActiveFilters(filters: UnifiedFilters): number {
  const defaults = emptyUnifiedFilters()
  let count = 0
  if (activeSectors(filters.sectors).length > 0) count++
  if (filters.nafCode.trim()) count++
  if (filters.department.trim()) count++
  if (filters.region.length > 0) count++
  if (filters.revenueMin.trim() || filters.revenueMax.trim()) count++
  if (filters.companyCategory.length > 0) count++
  if (filters.legalForm.trim()) count++
  if (filters.city.trim()) count++
  // #2642.2 — un rayon SANS ville n'a aucun effet : il ne compte pas comme un
  // critère à lui seul (même prudence que `buildRegistryQuery`).
  // #4515.1 — le rayon par défaut fait partie de la ville : seul un AUTRE choix compte un filtre de plus.
  if (filters.city.trim() && filters.cityRadiusKm !== DEFAULT_CITY_RADIUS_KM) count++
  // #3983.2 — la base ne compte que sur une zone (sinon elle n'a aucun effet).
  if (filters.siteBasis !== defaults.siteBasis && (filters.department.trim() || filters.region.length > 0)) count++
  if (filters.headcount.length > 0) count++
  if (filters.age !== defaults.age) count++
  if (filters.freetext.trim()) count++
  // #2165.27 — une exclusion compte toujours, dans les deux modes.
  if (filters.excludeSectors.length > 0) count++
  // #2616.2 — posé par le préréglage, jamais coché à la main : compte quand
  // même, même règle que les autres croisements écran.
  if (filters.excludePublicEmployers) count++
  // #2616.1 — une inclusion compte toujours, comme les autres croisements écran.
  if (filters.cdiOnly) count++
  // #4999 — même règle : une inclusion compte toujours.
  if (filters.freelanceOnly) count++
  // #5000 — même règle.
  if (filters.cddOnly) count++
  if (filters.interimOnly) count++
  // #3096 — même règle : une inclusion compte toujours.
  if (filters.remotePolicies.length > 0) count++
  // #3097 — même règle.
  if (filters.seniorities.length > 0) count++
  // #3528.3 — même règle.
  if (filters.decisionLevels.length > 0) count++
  // #3226 (#3203.6) — même règle.
  if (filters.deliveryFitFilter.length > 0) count++
  // #2165.28 / #2165.30 — filtres serveur mémoire marché.
  if (filters.technologiesObserved.trim()) count++
  if (filters.externalRecourseObserved) count++
  // #4632 — les deux critères de la mémoire marché venus du panneau retiré : posés, ils comptent (ils affinent).
  if (filters.roleFamilyObserved.trim()) count++
  if (filters.ecosystemObserved.trim()) count++
  // #5203 — un filtre de besoins posé RETIRE : il compte (« Tous » et aucune nature : rien).
  if (filters.needsPeriod !== NEED_PERIOD_ALL) count++
  if (filters.needsNature.length > 0) count++
  // #2165.24 — idem pour le groupe/filiale : aucun mode ne l'exprime nativement.
  if (filters.groupRole !== 'any') count++
  // #4294.7 — un interrupteur posé est un critère, comme les autres croisements.
  if (filters.workedOnly) count++
  // #2291.2 — croisé à l'écran dans les deux modes, comme le groupe/filiale.
  if (filters.contractRecourseObserved) count++
  // #4361.2 — un interrupteur posé est un critère, comme les autres croisements.
  if (filters.excludeListed) count++
  if (filters.entityType !== defaults.entityType) count++
  if (hasIntentSignals(filters)) {
    count++
    if (filters.sinceDays !== defaults.sinceDays) count++
    // Recette 21/10 B.7 — « Java » posé en compétence ET en mot-clé de l'URL est UN critère, pas deux.
    const keyword = filters.keywords.trim().toLowerCase()
    if (keyword && keyword !== filters.technologiesObserved.trim().toLowerCase()) count++
  }
  return count
}

/**
 * #3879.2 — RÉFUTÉ en recette prod le 08/10/2026 : le panneau « Recherche »
 * replié ne disait RIEN des critères actifs (secteur coché invisible sans le
 * rouvrir — « banque non lisible »). Les secteurs sont le critère le plus
 * souvent cité en recette ; `otherCount` compte le RESTE via
 * `countActiveFilters` (un seul mécanisme de comptage, GA-26), jamais un
 * second calcul parallèle. `null` quand rien n'est posé : une absence ne fait
 * aucune ligne (doctrine, Louis 20/09/2026).
 */
interface ActiveFiltersSummary {
  sectorCodes: string[]
  /** Critères actifs AU-DELÀ des secteurs. 0 = rien d'autre à dire. */
  otherCount: number
}

export function activeFiltersSummary(filters: UnifiedFilters): ActiveFiltersSummary | null {
  const total = countActiveFilters(filters)
  if (total === 0) return null
  const sectorCodes = activeSectors(filters.sectors)
  return { sectorCodes, otherCount: total - (sectorCodes.length > 0 ? 1 : 0) }
}

/**
 * #3941.5 (R41) — « Augmentation de capital » est-il le SEUL critère de signal coché ? Alors la liste ne doit porter
 * QUE des comptes avec ce signal daté : un compte sans lui ne répond pas à la demande (sinon dix cartes sans rien
 * de daté, sans un mot). Avec d'autres sources cochées, un compte peut répondre par l'une d'elles : rien n'est exclu.
 */
export function isCapitalIncreaseOnly(filters: UnifiedFilters): boolean {
  const sources = activeSignalSources(filters)
  return sources.length === 1 && sources[0] === 'capital'
}

/** Le candidat porte-t-il une annonce « Augmentation de capital » datée (BODACC B) ? */
function hasCapitalIncreaseSignal(candidate: DiscoverCandidate): boolean {
  return candidate.signals.some(signal => signal.type === 'business' && /augmentation de capital/i.test(signal.label))
}

/**
 * #4732.1 — « Rachat ou fusion » est-il le SEUL critère de signal coché ? Même règle que le capital : seuls les
 * comptes qui portent le signal daté répondent (le libellé est celui du serveur, `bodacc_takeover.SIGNAL_LABEL`).
 */
function isTakeoverOnly(filters: UnifiedFilters): boolean {
  const sources = activeSignalSources(filters)
  return sources.length === 1 && sources[0] === 'deal'
}

function hasTakeoverSignal(candidate: DiscoverCandidate): boolean {
  return candidate.signals.some(signal => signal.type === 'business' && /rachat ou fusion/i.test(signal.label))
}

/** Un signal d'intention est-il coché ? Décide de la source primaire. */
/**
 * #4316.1 / #4318.1 — UN champ « Compétences » : le même texte trie les offres/signaux
 * (`keywords`) ET filtre sur la techno observée (`technologiesObserved`). Il suffit
 * seul à lancer une recherche (« SAP » → registre filtré sur la pile observée).
 */
export function skillsText(filters: Pick<UnifiedFilters, 'keywords' | 'technologiesObserved'>): string {
  return filters.keywords.trim() || filters.technologiesObserved.trim()
}

/**
 * R22-DV4 — ce que le CHAMP « Compétences » affiche : la saisie TELLE QUELLE. `skillsText` rogne (il sert à
 * décider d'une recherche) ; branché sur un champ contrôlé il mangeait l'espace tapé à chaque frappe
 * (« archi cyber » devenait « archicyber »).
 */
export function skillsFieldValue(filters: Pick<UnifiedFilters, 'keywords' | 'technologiesObserved'>): string {
  return filters.keywords || filters.technologiesObserved
}

export function withSkills(filters: UnifiedFilters, text: string): UnifiedFilters {
  return { ...filters, keywords: text, technologiesObserved: text }
}

export function hasIntentSignals(filters: UnifiedFilters): boolean {
  return activeSignalSources(filters).length > 0
}

/**
 * #3878.1 — une incohérence RÉELLEMENT détectée entre deux critères du rail,
 * jamais déduite du seul NOMBRE de critères actifs.
 *
 * RÉFUTÉ en recette le 08/10/2026 : `discoverEmptyReason` choisissait « trop
 * de filtres empilés » dès que plus d'UN critère était actif
 * (`activeFilterCount > 1`), sans jamais vérifier qu'un de ces critères
 * explique le zéro observé — un compte à 2 filtres recevait le même
 * diagnostic qu'un compte à 6, sur un simple comptage. Cette fonction ne
 * tranche QUE les cas où la combinaison ne peut STRUCTURELLEMENT rendre aucun
 * candidat, jamais une supposition sur ce que le marché contient :
 *
 *  - un secteur à la fois COCHÉ et EXCLU (le même code dans `sectors` et
 *    `excludeSectors`) s'annule lui-même ;
 *  - un CA minimum AU-DESSUS du CA maximum ne peut, par construction,
 *    inclure aucune entreprise.
 *
 * ⚠️ Au-delà de ces deux cas PROUVABLES sans appel réseau, cette fonction ne
 * devine rien : un rail à cinq critères compatibles n'est pas incohérent, il
 * est simplement précis.
 */
export function detectInconsistentFilters(filters: UnifiedFilters): boolean {
  const included = activeSectors(filters.sectors)
  if (included.length > 0 && included.some(code => filters.excludeSectors.includes(code))) return true
  const min = parseAmount(filters.revenueMin)
  const max = parseAmount(filters.revenueMax)
  if (min !== undefined && max !== undefined && min > max) return true
  return false
}

/** Les trois axes qu'une sortie maigre peut proposer d'élargir — jamais une
 *  cible inventée : chacun nomme une contrainte RÉELLEMENT posée par
 *  l'utilisateur. */
export type DiscoverWidenAxis = 'zone' | 'headcount' | 'skills'

/**
 * #3814.3 — « Sortie maigre » (`IncompleteSearchNotice`) doit proposer UN
 * élargissement PRÉCIS, pas un bouton qui relâche tout à la fois sans le dire.
 *
 * Priorité zone > effectif > compétence : une zone resserrée (ville,
 * département, région) est la contrainte la plus fréquemment trop étroite en
 * sortie du rail (observé sur les retours bêta) ; vient ensuite l'effectif ;
 * le texte libre / la pile observée en dernier, car ils portent déjà
 * l'intention la plus spécifique de l'utilisateur.
 *
 * `null` quand aucun des trois n'est posé : il n'y a alors rien de précis à
 * nommer, et en inventer un serait exactement ce que la doctrine interdit
 * (« jamais de cible inventée »).
 */
export function suggestedWidenAxis(filters: UnifiedFilters): DiscoverWidenAxis | null {
  if (filters.city.trim() || filters.department.trim() || filters.region.length > 0) return 'zone'
  if (filters.headcount.length > 0) return 'headcount'
  if (filters.freetext.trim() || filters.technologiesObserved.trim()) return 'skills'
  return null
}

/**
 * #4429.5 (Louis, 25/10/2026) — le geste manuel « Élargir la zone » franchit UN barreau, jamais « Lille → France ».
 *
 * Avant, il vidait ville, département ET région d'un seul geste. Maintenant il ne retire que la contrainte la plus
 * étroite posée : la ville, puis le département, puis la région. Une ville seule, avec un rayon plus étroit que le
 * défaut, revient d'abord au rayon par défaut (25 km ; le serveur élargit ensuite seul, palier par palier, #4641) ;
 * au rayon par défaut, retirer la ville est le geste EXPLICITE vers toute la France. ⚠️ Règle FINALE (Louis
 * 27/10/2026) : l'élargissement AUTOMATIQUE monte lui aussi jusqu'à la France (département, région, France), sans
 * s'arrêter ni demander — il renverse l'arrêt à la région de #4640 ; ce geste reste le raccourci de l'utilisateur.
 * Aucun autre critère n'est relâché : seule la ZONE grandit.
 */
export function widenZoneOneStep(filters: UnifiedFilters): UnifiedFilters {
  const hasCity = filters.city.trim() !== ''
  const hasDepartment = filters.department.trim() !== ''
  if (hasCity && (hasDepartment || filters.region.length > 0)) return { ...filters, city: '' }
  if (hasCity && filters.cityRadiusKm !== DEFAULT_CITY_RADIUS_KM) {
    return { ...filters, cityRadiusKm: DEFAULT_CITY_RADIUS_KM }
  }
  if (hasCity) return { ...filters, city: '' }
  if (hasDepartment) return { ...filters, department: '' }
  return { ...filters, region: [] }
}

/** Source primaire de la recherche : le SIGNAL dès qu'une intention est cochée,
 *  sinon le REGISTRE. */
export function primaryMode(filters: UnifiedFilters): 'registry' | 'signals' {
  return hasIntentSignals(filters) ? 'signals' : 'registry'
}

/** Tranche structurée extraite du rail. */
export function registryPart(filters: UnifiedFilters): RegistryFilters {
  return {
    sectors: filters.sectors,
    nafCode: filters.nafCode,
    department: filters.department,
    region: filters.region,
    revenueMin: filters.revenueMin,
    revenueMax: filters.revenueMax,
    companyCategory: filters.companyCategory,
    legalForm: filters.legalForm,
    city: filters.city,
    cityRadiusKm: filters.cityRadiusKm,
    siteBasis: filters.siteBasis,
    headcount: filters.headcount,
    age: filters.age,
    freetext: filters.freetext,
    technologiesObserved: filters.technologiesObserved,
    externalRecourseObserved: filters.externalRecourseObserved,
    roleFamilyObserved: filters.roleFamilyObserved,
    ecosystemObserved: filters.ecosystemObserved,
    needsPeriod: filters.needsPeriod,
    needsNature: filters.needsNature,
    excludeListed: filters.excludeListed,
  }
}

/** Tranche « signaux » extraite du rail. */
export function signalsPart(filters: UnifiedFilters): SignalsFilters {
  return {
    sources: activeSignalSources(filters),
    department: filters.department,
    sinceDays: filters.sinceDays,
    keywords: filters.keywords,
    entityType: filters.entityType,
    // Le rail est COMMUN aux deux modes et affiche les mêmes pastilles de
    // secteur. Les laisser tomber ici rendait le filtre totalement muet en mode
    // Signaux : rien n'était envoyé, donc rien ne revenait, donc rien ne
    // pouvait le signaler à l'écran.
    sectors: filters.sectors,
    technologiesObserved: filters.technologiesObserved,
    externalRecourseObserved: filters.externalRecourseObserved,
    roleFamilyObserved: filters.roleFamilyObserved,
    ecosystemObserved: filters.ecosystemObserved,
    needsPeriod: filters.needsPeriod,
    needsNature: filters.needsNature,
    // #3096 / #3097 — RÉFUTÉ en prod le 27/09 : absents d'ici, `signalsPart`
    // laissait tomber la politique de télétravail et la séniorité cochées au
    // rail avant même d'atteindre `buildSignalsQuery`. Le serveur les applique
    // AVANT de tronquer à `limit` (`discover_signals.py`,
    // `after_seniority = after_remote[:limit]`) : sans eux ici, la page rendue
    // n'était plus composée en tenant compte de ce que le commercial a coché.
    remotePolicies: filters.remotePolicies,
    seniorities: filters.seniorities,
    // #3226 (#3203.6) — même raison que remotePolicies/seniorities ci-dessus.
    deliveryFitFilter: filters.deliveryFitFilter,
  }
}

/**
 * Le rail est-il lançable ? Le mode Signaux part toujours d'un fait daté (donc
 * lançable sans autre critère) ; le mode Registre exige au moins un critère
 * structuré, sinon la requête serait un dump de registre.
 */
export function isUnifiedRunnable(filters: UnifiedFilters): boolean {
  return hasIntentSignals(filters) || isRegistryQueryRunnable(registryPart(unifiedSkills(filters)))
}

/**
 * Recette 21/10 S.4 — le compteur (`countActiveFilters`) compte aussi les croisements d'écran (niveau de décision,
 * séniorité, fit, groupe/filiale, recours, exclusions…) que la requête registre ne porte PAS : posés seuls, le bandeau
 * disait « 1 critère posé » et le bouton « Ajoute un critère… ». Ces critères AFFINENT une recherche, ils ne la lancent
 * pas : l'écran le dit au lieu de se contredire. Même source que le bouton (`isUnifiedRunnable`) et le compteur.
 */
export function refinesWithoutLaunching(filters: UnifiedFilters): boolean {
  return countActiveFilters(filters) > 0 && !isUnifiedRunnable(filters)
}

/** #4317 — « Mots-clés » et « Compétences » sont UN champ : le texte posé d'un seul côté vaut des deux. */
function unifiedSkills(filters: UnifiedFilters): UnifiedFilters {
  const text = skillsText(filters)
  return text ? withSkills(filters, text) : filters
}

/**
 * Rail unifié → requête Découvrir, ou `null` quand rien n'est lançable.
 *
 * `null` (registre sans aucun critère) laisse l'écran en état « idle » plutôt
 * que de tirer un dump du registre.
 */
export function buildDiscoverRequest(
  filters: UnifiedFilters,
  nowMs: number = Date.now(),
  // #2291.9 — le volume PROPOSÉ, adapté à la capacité commerciale déclarée
  // (`discover-capacity.ts`, `proposedAccountVolume`). Défaut inchangé.
  limit: number = DISCOVER_PAGE_SIZE,
): DiscoverRequest | null {
  if (hasIntentSignals(filters)) {
    return { mode: 'signals', query: buildSignalsQuery(signalsPart(filters), limit) }
  }
  const registry = registryPart(unifiedSkills(filters))
  if (!isRegistryQueryRunnable(registry)) return null
  return { mode: 'registry', query: buildRegistryQuery(registry, nowMs, limit, skillsText(filters)) }
}

/* ------------------------------------------------------------------ */
/*  Croisement côté écran — sur les FAITS RÉELS, jamais fabriqués.      */
/* ------------------------------------------------------------------ */

const DAY_MS = 24 * 60 * 60 * 1000

// #3814 — déplacé vers `discover-types.ts` (sans dépendance vers
// `discover-ranking.ts`, qui en a aussi besoin pour le tri « Taille ») ;
// réexporté ici pour ne rien casser des imports existants.
export { parseHeadcountLabel } from './discover-types'

/**
 * Le candidat est-il du secteur demandé ?
 *
 * Comparé par PRÉFIXE NAF à quatre chiffres, pas par section. La section
 * (`industry` → `C`) couvrait les divisions 10 à 33 : un fabricant de
 * dispositifs médicaux passait le filtre d'un avionneur. Le préfixe descend à
 * la classe — c'est la finesse que le vocabulaire partagé porte déjà.
 *
 * ⚠️ Un code NAF absent ou illisible n'écarte JAMAIS le candidat : on ne peut
 * pas AFFIRMER qu'il contredit le filtre, et écarter sur une absence de donnée
 * ferait disparaître de vraies cibles sans le dire.
 */
/**
 * Les préfixes NUMÉRIQUES d'un code NAF saisi À LA MAIN.
 *
 * Même découpage que `buildRegistryQuery` (virgules, points-virgules, espaces),
 * puis les chiffres seuls : le registre écrit « 6201 », l'utilisateur tape
 * « 62.01Z », et une comparaison littérale raterait. Un jeton sans chiffre
 * (« Z », une faute de frappe) est jeté plutôt que de contraindre sur rien.
 */
function manualNafPrefixes(raw: string): string[] {
  const out: string[] = []
  for (const token of raw.split(/[\s,;]+/)) {
    const digits = token.replace(/\D/g, '')
    if (digits && !out.includes(digits)) out.push(digits)
  }
  return out
}

function passesSectors(candidate: DiscoverCandidate, sectors: readonly string[], manualNaf: string): boolean {
  const prefixes = nafPrefixesForSectors(sectors)
  // #1766 — le code NAF SAISI À LA MAIN croise ici lui aussi.
  //
  // Il était mort en mode Signaux : absent de `buildSignalsQuery` (le serveur ne
  // l'accepte pas), et jamais croisé côté écran. L'utilisateur tapait « 62.01Z »
  // et rien ne se passait — sans un mot. C'est exactement le défaut déjà payé
  // pour `sectors`, et c'est le MÊME correctif : croiser sur le fait réel que
  // chaque candidat porte déjà, jamais sur une donnée fabriquée.
  //
  // ⚠️ Union, pas intersection — comme le registre. `buildRegistryQuery` joint
  // les codes du secteur et le code saisi par un OU (« deux façons de dire : ce
  // terrain m'intéresse »). Croiser en ET ici ferait dire deux choses
  // différentes au même formulaire selon le mode.
  const manual = manualNafPrefixes(manualNaf)
  if (prefixes.length === 0 && manual.length === 0) return true
  const digits = (candidate.nafCode ?? '').replace(/\D/g, '')
  if (digits.length < 4) return true
  return prefixes.includes(digits.slice(0, 4)) || manual.some(prefix => digits.startsWith(prefix))
}

/**
 * #3908 — UNION des tranches cochées : un candidat passe s'il chevauche AU
 * MOINS UNE tranche sélectionnée, jamais l'intervalle enveloppe (« 10-49 » +
 * « 250-499 » ne doit pas laisser passer un effectif de 100).
 */
function passesHeadcount(candidate: DiscoverCandidate, headcount: readonly HeadcountRange[]): boolean {
  const selected = activeHeadcountRanges(headcount)
  if (selected.length === 0) return true
  const range = parseHeadcountLabel(candidate.headcountRange)
  if (range === null) return true // donnée absente/illisible → on ne contredit pas
  return selected.some(option => {
    const bounds = HEADCOUNT_BOUNDS[option]
    const min = bounds.headcountMin ?? 0
    const max = bounds.headcountMax ?? Infinity
    return range[0] <= max && min <= range[1]
  })
}

function passesAge(candidate: DiscoverCandidate, age: CompanyAgeBucket, nowMs: number): boolean {
  if (age === 'any') return true
  if (!candidate.creationDate) return true
  const created = Date.parse(candidate.creationDate)
  if (Number.isNaN(created)) return true
  const years = (nowMs - created) / (365 * DAY_MS)
  if (age === 'lt3') return years < 3
  if (age === '3to10') return years >= 3 && years <= 10
  return years > 10 // gt10
}

/**
 * #2165.27 — le candidat est-il HORS des secteurs exclus ?
 *
 * Même préfixe NAF à quatre chiffres que `passesSectors`, négé : un candidat
 * dont le NAF tombe dans un secteur exclu est écarté. Un NAF absent ou trop
 * court n'est jamais AFFIRMÉ appartenir au secteur exclu — il reste, comme
 * `passesSectors` garde un candidat sans donnée plutôt que de le contredire.
 */
function passesExclusions(candidate: DiscoverCandidate, excludeSectors: readonly string[]): boolean {
  if (excludeSectors.length === 0) return true
  const prefixes = nafPrefixesForSectors(excludeSectors)
  if (prefixes.length === 0) return true
  const digits = (candidate.nafCode ?? '').replace(/\D/g, '')
  if (digits.length < 4) return true
  return !prefixes.includes(digits.slice(0, 4))
}

/**
 * #2616.2 — le candidat porte-t-il un signal de recrutement CONFIRMÉ chez un
 * employeur public ?
 *
 * RÉFUTÉ en recette le 21/09 : `is_public_employer`/`signal.publicEmployer`
 * (IA) étaient déjà calculés et ÉTIQUETAIENT le signal, mais rien ne les
 * LISAIT côté écran (0 résultat de grep sur `apps/web`) — le préréglage
 * « comptes qui recrutent » ne posait ni `excludeSectors` ni `entityType`, et
 * une recette qui n'avait vu que des comptes privés avait conclu, à tort,
 * que le filtre marchait.
 *
 * Non destructif comme `passesExclusions` : un signal MUET sur ce point
 * (`publicEmployer === undefined`, catégorie juridique non résolue) n'est
 * jamais AFFIRMÉ public — le candidat reste (GA-18/19).
 *
 * Ne regarde QUE les signaux `hiring` — un employeur public sur un marché
 * `tender`/`award` (BOAMP/DECP) reste affiché, c'est le sens même de ces deux
 * signaux (apport de feat/trois-points-et-leur-appelant-21-09, fusionné en
 * vague 15 ; son exclusion SANS préréglage a été écartée : elle contredisait
 * « sans exclusion demandée, rien ne change »).
 */
function passesPublicEmployerExclusion(candidate: DiscoverCandidate, excludePublicEmployers: boolean): boolean {
  if (!excludePublicEmployers) return true
  return !candidate.signals.some(signal => signal.type === 'hiring' && signal.publicEmployer === true)
}

/**
 * #4746 — « clients finaux uniquement » : le candidat est-il, PAR NATURE, autre chose qu'un client final ?
 *
 * L'exclusion porte sur ce que l'entreprise EST (ESN, plateforme/cabinet, partenaire déclaré), jamais sur ce
 * que l'annonce dit. Elle s'applique dans LES DEUX modes : le registre ne reçoit pas `entityType`
 * (`registryPart`), et une liste qui rend des ESN malgré la coche est inexploitable. Un candidat dont la nature
 * n'est pas établie reste (GA-18/19). Les lectures « ESN » et « tous » ne retirent rien : la route de rang 2
 * est une capacité voulue (#4285.3).
 */
function passesEndClientsOnly(candidate: DiscoverCandidate, entityType: DiscoverEntityType): boolean {
  if (entityType !== 'client') return true
  return !(candidate.isEsnPeer === true || candidate.isIntermediary === true || candidate.isDeclaredPartner === true)
}

/**
 * #2616.1 — le candidat porte-t-il un signal `hiring` CONFIRMÉ CDI ?
 *
 * INCLUSION, pas exclusion (à la différence de `passesPublicEmployerExclusion`
 * ci-dessus) : décoché, rien ne change ; coché, un candidat SANS signal
 * `hiring` confirmé CDI (aucun signal `hiring`, ou un code non vérifié /
 * jamais lisible comme APEC) sort de la vue — « non observé » n'est jamais
 * traité comme « CDI » (GA-18/19), donc jamais gardé par erreur.
 */
/** #4999 — un signal `hiring` dont la SOURCE dit freelance/mission/indépendant ; muet ⇒ ne passe pas (GA-18/19). */
function passesFreelanceOnly(candidate: DiscoverCandidate, freelanceOnly: boolean): boolean {
  if (!freelanceOnly) return true
  return candidate.signals.some(signal => signal.type === 'hiring' && signal.contractType === 'FREELANCE')
}

/** #5000 — CDD / intérim : même lecture du champ contrat de la source, muet ⇒ ne passe pas (GA-18/19). */
function passesContractOnly(candidate: DiscoverCandidate, wanted: 'CDD' | 'INTERIM', on: boolean): boolean {
  if (!on) return true
  return candidate.signals.some(signal => signal.type === 'hiring' && signal.contractType === wanted)
}

function passesCdiOnly(candidate: DiscoverCandidate, cdiOnly: boolean): boolean {
  if (!cdiOnly) return true
  return candidate.signals.some(signal => signal.type === 'hiring' && signal.contractType === 'CDI')
}

/**
 * #3096 — le candidat porte-t-il un signal `hiring` dont la politique de
 * télétravail est l'une de celles cochées ?
 *
 * INCLUSION, même construction que `passesCdiOnly` : aucune coche, rien ne
 * change ; une coche posée, un candidat sans signal `hiring` évalué sur ce
 * point sort de la vue — « non évalué » n'est jamais traité comme une des
 * politiques cochées (GA-18/19), donc jamais gardé par erreur.
 */
function passesRemotePolicy(candidate: DiscoverCandidate, wanted: RemotePolicy[]): boolean {
  if (wanted.length === 0) return true
  return candidate.signals.some(
    signal => signal.type === 'hiring' && !!signal.remoteWorkPolicy && wanted.includes(signal.remoteWorkPolicy),
  )
}

/**
 * #3097 — le candidat porte-t-il un signal `hiring` dont la séniorité est
 * l'une de celles cochées ? Même construction que `passesRemotePolicy`.
 */
function passesSeniority(candidate: DiscoverCandidate, wanted: SeniorityFilter[]): boolean {
  if (wanted.length === 0) return true
  return candidate.signals.some(
    signal => signal.type === 'hiring' && !!signal.seniority && wanted.includes(signal.seniority),
  )
}

/** Les niveaux de contact CONNUS par entreprise (clé `normalizeCompanyKey`),
 *  déduits UNE fois de l'intitulé par le référentiel partagé. */
type KnownContactLevels = ReadonlyMap<string, ReadonlySet<CoverageLevel>>

/** #3528.3 — les contacts de l'espace, groupés par entreprise : seuls les
 *  niveaux déterminables entrent (`null` = inconnu, jamais deviné). */
export function knownContactLevelsByCompany(contacts: readonly ContactListItem[]): KnownContactLevels {
  const out = new Map<string, Set<CoverageLevel>>()
  for (const item of contacts) {
    if (!item.company_name) continue
    const key = normalizeCompanyKey(item.company_name)
    const level = resolveContactLevel({ title: item.title, decisionRole: item.decision_role })
    if (key === '' || level === null) continue
    const bucket = out.get(key)
    if (bucket) bucket.add(level)
    else out.set(key, new Set([level]))
  }
  return out
}

/**
 * X37 / #3528.3 — le même critère, côté CONTACTS rendus (vue « Contacts ») : un
 * niveau coché ne garde que les contacts dont le niveau (`resolveContactLevel`,
 * déjà porté par la ligne) est l'un de ceux visés. Niveau indéterminable ⇒ le
 * contact ne passe pas — rien d'inventé. Rien coché ⇒ la liste telle quelle.
 */
export function filterContactRowsByDecisionLevel<T extends { level: CoverageLevel | null }>(
  rows: readonly T[],
  wanted: readonly DecisionLevelFilter[],
): T[] {
  if (wanted.length === 0) return [...rows]
  return rows.filter(row => row.level !== null && wanted.includes(row.level))
}

/**
 * #3528 (recette prod 03/10) — combien de comptes CE filtre écarte, pour que
 * l'écran DISE pourquoi la liste se vide au lieu d'un vide muet : « N comptes
 * écartés : niveau de décision inconnu pour leurs contacts ». Mesuré par
 * différence sur le MÊME croisement (tous les autres filtres restent), donc
 * exact ; `null` quand aucun niveau n'est coché.
 */
export function decisionLevelImpact(
  candidates: readonly DiscoverCandidate[],
  filters: UnifiedFilters,
  mode: 'registry' | 'signals',
  nowMs: number,
  known: KnownContactLevels | undefined,
): { removedCount: number } | null {
  if (filters.decisionLevels.length === 0) return null
  const without = applyRailConstraints(candidates, { ...filters, decisionLevels: [] }, mode, nowMs).length
  const withLevel = applyRailConstraints(candidates, filters, mode, nowMs, known).length
  return { removedCount: Math.max(0, without - withLevel) }
}

function passesDecisionLevel(
  candidate: DiscoverCandidate,
  wanted: DecisionLevelFilter[],
  known: KnownContactLevels | undefined,
): boolean {
  if (wanted.length === 0) return true
  const levels = known?.get(normalizeCompanyKey(candidate.name))
  return !!levels && wanted.some(level => levels.has(level))
}

/**
 * #3226 (#3203.6) — le candidat porte-t-il un signal `hiring` dont le
 * delivery fit est l'un de ceux cochés ? Même construction que
 * `passesSeniority`.
 */
function passesDeliveryFit(candidate: DiscoverCandidate, wanted: DeliveryFitFilter[]): boolean {
  if (wanted.length === 0) return true
  return candidate.signals.some(
    signal => signal.type === 'hiring' && !!signal.deliveryFit && wanted.includes(signal.deliveryFit),
  )
}

/**
 * #2165.24 — le candidat porte-t-il le rôle capitalistique demandé ?
 *
 * `'any'` accepte tout. Au-delà, EXCLUSIF plutôt que permissif : contrairement
 * aux autres critères de ce fichier, l'absence de donnée n'est pas un « ne
 * contredit pas » — c'est l'immense majorité des candidats (le lien n'est
 * résolu que pour un compte déjà possédé, cf. `DiscoverCandidate.groupRole`).
 * Laisser passer l'inconnu rendrait le filtre inopérant : choisir « Filiale »
 * afficherait quasiment tous les candidats, y compris ceux dont on ne sait
 * rien. Ici, « je ne sais pas » n'est pas confondu avec « oui » : c'est exclu,
 * pas affirmé faux.
 */
function passesGroupRole(candidate: DiscoverCandidate, groupRole: UnifiedFilters['groupRole']): boolean {
  if (groupRole === 'any') return true
  return candidate.groupRole === groupRole
}

/**
 * #4294.7 — « Déjà travaillées » : EXCLUSIF comme `groupRole`. Un candidat neuf n'est pas dans l'espace, donc pas
 * travaillé — c'est un fait connu, pas une absence. Le prédicat est calculé à la lecture côté API
 * (`workedBefore`), jamais deviné ici depuis `portfolioState` : « analysé » n'est ni une relation ni une mission.
 */
function passesWorked(candidate: DiscoverCandidate, workedOnly: boolean): boolean {
  return !workedOnly || candidate.workedBefore === true
}

/**
 * #2291.2 — l'observation du candidat montre-t-elle un recours à
 * l'INDÉPENDANT (offres « Profession libérale », le seul code natif
 * d'indépendant de France Travail) ou à la RÉGIE (un avis de marché qui dit
 * « assistance technique » / « en régie ») ? `null` = rien d'observé.
 *
 * ⚠️ L'intérim n'en est pas : c'est une mise à disposition par une agence, ni
 * un indépendant ni une prestation d'ESN. Et une observation SANS ces deux
 * modes ne dit pas « n'y recourt pas » — seulement ce qui a été lu.
 */
function observesContractRecourse(candidate: DiscoverCandidate): boolean | null {
  const model = candidate.contractModel
  if (!model) return null
  return (model.jobOffers?.counts.freelance ?? 0) > 0 || (model.publicContracts?.regie ?? 0) > 0
}

function passesContractRecourse(candidate: DiscoverCandidate, contractRecourseObserved: boolean): boolean {
  if (!contractRecourseObserved) return true
  return observesContractRecourse(candidate) === true
}

/**
 * #2291.2 — le filtre DIT ce qu'il retire, inconnu ≠ non (même doctrine que
 * `buildRelationChipImpacts`, GA-18/GA-19). EXCLUSIF comme `groupRole` : un
 * candidat jamais observé est retiré de la vue filtrée — le garder rendrait le
 * filtre inopérant — mais il est COMPTÉ à part, jamais confondu avec un
 * candidat observé sans indépendant ni régie. `null` quand le filtre est
 * décoché : il n'a rien retiré, il n'a rien à dire.
 *
 * `candidates` = le pool que `applyRailConstraints` reçoit : le filtre y est
 * appliqué EN PREMIER, donc ce compte est exactement le sien.
 */
export function contractRecourseImpact(
  candidates: readonly DiscoverCandidate[],
  filters: UnifiedFilters,
): { removedCount: number; unknownCount: number } | null {
  if (!filters.contractRecourseObserved) return null
  const removed = candidates.filter(candidate => !passesContractRecourse(candidate, true))
  return {
    removedCount: removed.length,
    unknownCount: removed.filter(candidate => observesContractRecourse(candidate) === null).length,
  }
}

/**
 * #2151.30 — le territoire ESN/partenaire ne croisait qu'UN département en
 * mode Signaux (`parseDepartment` singulier, envoyé au collecteur) : au-delà
 * du premier, les départements tapés disparaissaient sans un mot. On croise
 * ici sur TOUS ceux saisis (`parseDepartments`, pluriel — même parseur que le
 * registre), sur le fait réel que porte déjà le candidat. Un candidat sans
 * département n'est jamais AFFIRMÉ hors zone : il reste, comme les autres
 * critères de ce bloc.
 */
function passesDepartment(candidate: DiscoverCandidate, department: string): boolean {
  const wanted = parseDepartments(department)
  if (wanted.length === 0) return true
  if (!candidate.department) return true
  return wanted.includes(candidate.department)
}

/**
 * #2151.31-.34 — nom normalisé pour rapprocher un candidat de marché (dont
 * `account_partners` ne connaît pas le SIREN, seulement le nom saisi/détecté)
 * de l'agrégat par ESN de l'espace. Même limite assumée que l'annuaire
 * partenaire existant (`esn-on-accounts-merge.ts`, côté API) : rapprochement
 * par nom, pas par identifiant — deux orthographes distinctes ne se
 * rapprochent pas, ce qui sous-compte plutôt que de sur-affirmer.
 */
export function normalizePartnerName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Index `nom normalisé → dossiers de l'espace l'ayant vue`, depuis
 *  `GET /partners/on-my-accounts` (déjà exposé, lecture seule). */
export function buildPartnerCoverageIndex(rows: readonly { name: string; accounts: number }[]): Map<string, number> {
  const index = new Map<string, number>()
  for (const row of rows) {
    const key = normalizePartnerName(row.name)
    const existing = index.get(key) ?? 0
    if (row.accounts > existing) index.set(key, row.accounts)
  }
  return index
}

/**
 * Le candidat ESN a-t-il été vu sur au moins `minAccountsSeen` dossiers de
 * l'espace ? Sans seuil posé, rien ne contraint — une ESN JAMAIS vue reste
 * dans la liste tant que personne n'a demandé de seuil : l'absence de
 * correspondance n'est affirmée « 0 dossier » qu'au moment où elle sert
 * réellement à écarter, jamais avant.
 *
 * ⚠️ HORS de `UnifiedFilters`/`applyRailConstraints` À DESSEIN : ce critère ne
 * croise PAS un fait du candidat (GA-275 protège cette famille-là), il croise
 * un AGRÉGAT DE L'ESPACE lu à part (`GET /partners/on-my-accounts`, jamais
 * envoyé à la recherche). Même statut que `needCompany`/`signalNature` côté
 * `Discover.tsx` : un état d'écran local, appliqué en direct sur `visible`.
 */
export function passesMinAccountsSeen(
  candidateName: string,
  minAccountsSeen: number | null,
  coverage: ReadonlyMap<string, number>,
): boolean {
  if (minAccountsSeen === null || minAccountsSeen <= 0) return true
  const seen = coverage.get(normalizePartnerName(candidateName)) ?? 0
  return seen >= minAccountsSeen
}

/**
 * #2151.33 / #2151.34 — DÉCISION Louis 18/09 : les trois filtres demandés par
 * #2151 sont livrés, revenant sur le remplacement unique du 17/09 (voir
 * `passesMinAccountsSeen` ci-dessus). Comme lui, « relation existante » et
 * « rang 2 » croisent l'AGRÉGAT de l'espace (`GET /partners/on-my-accounts`,
 * `EsnOnAccountsRow.knownRelationship` / `.rank2`), jamais un fait porté par
 * le candidat Découvrir — HORS de `UnifiedFilters`/`applyRailConstraints` à
 * dessein, même famille que `passesMinAccountsSeen` (GA-275).
 */
export interface PartnerRelationSummary {
  /** Combien de comptes de l'espace tiennent cette ESN en rang 2. */
  rank2: number
  /** Combien de comptes portent une relation CONNUE (`partner`/`competitor`,
   *  jamais `unknown`) pour cette ESN. */
  knownRelationship: number
  /**
   * #2151.32 — combien de comptes de l'espace où la MÉMOIRE MARCHÉ a observé
   * cette ESN (parcours de personnes). N'est PAS `rank2`/`knownRelationship` :
   * ceux-là croisent `account_partners` (présence déclarée/détectée), celui-ci
   * croise le corpus — une ESN peut être en place sans être observée, et
   * l'inverse.
   */
  observedAtAccounts: number
  /**
   * #2151.32 — combien de comptes, PARMI ceux qui portent cette ESN, n'ont pas
   * pu être résolus par la mémoire marché. Doctrine c65/GA-259 : jamais confondu
   * avec « observedAtAccounts === 0 », qui affirme au contraire une lecture
   * réussie et vide.
   */
  unresolvedAtAccounts: number
}

/** Index `nom normalisé → {rank2, knownRelationship, observedAtAccounts,
 *  unresolvedAtAccounts}`, depuis la même réponse que `buildPartnerCoverageIndex`
 *  (`GET /partners/on-my-accounts`). Même règle de doublon : le nom normalisé
 *  qui revient sur deux lignes garde le MAXIMUM de chaque compteur, jamais une
 *  somme qui doublerait un même compte compté deux fois par deux graphies. */
export function buildPartnerRelationIndex(
  rows: readonly {
    name: string
    rank2?: number
    knownRelationship?: number
    observedAtAccounts?: number
    unresolvedAtAccounts?: number
  }[],
): Map<string, PartnerRelationSummary> {
  const index = new Map<string, PartnerRelationSummary>()
  for (const row of rows) {
    const key = normalizePartnerName(row.name)
    const existing = index.get(key) ?? {
      rank2: 0,
      knownRelationship: 0,
      observedAtAccounts: 0,
      unresolvedAtAccounts: 0,
    }
    index.set(key, {
      rank2: Math.max(existing.rank2, row.rank2 ?? 0),
      knownRelationship: Math.max(existing.knownRelationship, row.knownRelationship ?? 0),
      observedAtAccounts: Math.max(existing.observedAtAccounts, row.observedAtAccounts ?? 0),
      unresolvedAtAccounts: Math.max(existing.unresolvedAtAccounts, row.unresolvedAtAccounts ?? 0),
    })
  }
  return index
}

/**
 * #2151.33 — la relation de l'espace à cette ESN est-elle déjà QUALIFIÉE
 * (partenaire ou concurrent) sur au moins un dossier ? Décoché, aucune
 * contrainte. Coché, une ESN dont la relation reste `unknown` PARTOUT (ou
 * jamais vue) est écartée — ne jamais confondre « pas encore qualifiée » avec
 * « qualifiée » (GA-18/GA-19).
 */
export function passesExistingRelationship(
  candidateName: string,
  existingRelationshipOnly: boolean,
  index: ReadonlyMap<string, PartnerRelationSummary>,
): boolean {
  if (!existingRelationshipOnly) return true
  const summary = index.get(normalizePartnerName(candidateName))
  return (summary?.knownRelationship ?? 0) > 0
}

/**
 * #2151.34 — cette ESN tient-elle le RANG 2 sur au moins un dossier de
 * l'espace ? Une ouverture à formaliser, pas un rang 1 en place — voir
 * `EsnOnAccountsRow.rank2`. Décoché, aucune contrainte.
 */
export function passesRank2Opening(
  candidateName: string,
  rank2OpeningOnly: boolean,
  index: ReadonlyMap<string, PartnerRelationSummary>,
): boolean {
  if (!rank2OpeningOnly) return true
  const summary = index.get(normalizePartnerName(candidateName))
  return (summary?.rank2 ?? 0) > 0
}

/**
 * #2151.32 — cette ESN a-t-elle été OBSERVÉE (mémoire marché) sur au moins un
 * compte de l'espace ? Décoché, aucune contrainte — même famille que
 * `passesExistingRelationship`/`passesRank2Opening` ci-dessus.
 *
 * DÉCISION Louis 18/09 (QCM) : une valeur NON MESURÉE n'est jamais comptée
 * « non » — un compte que la mémoire marché n'a pas pu résoudre ne fait JAMAIS
 * échouer le filtre (doctrine c65/GA-259, GA-18/GA-19). Coché, une ESN reste
 * donc gardée soit parce qu'elle est réellement observée, soit parce
 * qu'au moins un de ses comptes reste « inconnu » — jamais écartée en
 * silence sur une absence de lecture. `isObservedClientsUnknown` ci-dessous
 * distingue les deux pour l'écran.
 */
export function passesObservedClients(
  candidateName: string,
  observedClientsOnly: boolean,
  index: ReadonlyMap<string, PartnerRelationSummary>,
): boolean {
  if (!observedClientsOnly) return true
  const summary = index.get(normalizePartnerName(candidateName))
  if (!summary) return false
  return summary.observedAtAccounts > 0 || summary.unresolvedAtAccounts > 0
}

/**
 * #2151.32 — cette ESN passe-t-elle `passesObservedClients` SEULEMENT parce
 * qu'un compte reste inconnu (jamais parce qu'elle est réellement observée) ?
 * Sert au compteur « N inconnus » affiché à côté du filtre — l'écran doit
 * pouvoir dire combien de candidats gardés le sont faute de savoir, jamais le
 * taire (même doctrine que `passesObservedClients`).
 */
export function isObservedClientsUnknown(
  candidateName: string,
  index: ReadonlyMap<string, PartnerRelationSummary>,
): boolean {
  const summary = index.get(normalizePartnerName(candidateName))
  if (!summary) return false
  return summary.observedAtAccounts === 0 && summary.unresolvedAtAccounts > 0
}

/**
 * #2165.51 — filtre « Expertise » du panneau Partenaires. RÉFUTÉ en prod le
 * 19/09/2026 : `/discover?type=partners` → « Tous les filtres » n'avait AUCUN
 * filtre Expertise, alors que Contacts/Liste d'appels l'ont déjà
 * (`ProjectionResults.tsx`, `CallListResults.tsx` — l'expertise de la
 * PERSONNE). Pour une ESN, « expertise » désigne autre chose : le secteur
 * résolu au REGISTRE, déjà porté par `DiscoverCandidate.sector` et déjà
 * affiché sur la ligne (`PartnerResultRow.tsx`, #2166.35), jamais une
 * seconde taxonomie inventée.
 *
 * Contrairement à `passesObservedClients` ci-dessus (un AGRÉGAT de l'espace
 * où « inconnu » reste toujours GARDÉ, GA-18/GA-19), l'expertise est un fait
 * DIRECT du candidat : `sector === null` veut dire que le registre ne l'a
 * pas rendu, jamais qu'il n'en a pas. Coché, un candidat sans secteur résolu
 * est donc ÉCARTÉ — mais TOUJOURS compté à part (`isExpertiseUnknown`)
 * plutôt que confondu avec « pas de correspondance » (même doctrine c65/
 * GA-259 : même patron d'affichage que `observedClientsUnknownCount`).
 */
export function passesExpertiseKnown(candidate: DiscoverCandidate, expertiseKnownOnly: boolean): boolean {
  if (!expertiseKnownOnly) return true
  return candidate.sector !== null
}

/** #2165.51 — ce candidat est-il celui que `passesExpertiseKnown` écarte
 *  faute de secteur résolu ? Sert au compteur affiché à côté du filtre. */
export function isExpertiseUnknown(candidate: DiscoverCandidate): boolean {
  return candidate.sector === null
}

/**
 * #2151.33 — le filtre dit ce qu'il a retiré, inconnu ≠ non. Cette ESN
 * échoue-t-elle « relation déjà qualifiée » ? La relation par compte est
 * TERNAIRE (`partner` / `competitor` / `unknown`, voir
 * `esn-on-accounts-merge.ts`) : il n'existe AUCUN état « mesuré, mais pas
 * partenaire » — échouer ce filtre veut donc TOUJOURS dire « jamais
 * qualifiée », jamais un « non » mesuré (GA-18/GA-19). Équivalent à
 * `!passesExistingRelationship(candidateName, true, index)`, nommé à part
 * pour que l'appelant (le compteur d'écran) n'ait jamais à redériver cette
 * équivalence lui-même.
 */
export function isExistingRelationshipUnknown(
  candidateName: string,
  index: ReadonlyMap<string, PartnerRelationSummary>,
): boolean {
  return !passesExistingRelationship(candidateName, true, index)
}

/**
 * #2151.34 — le filtre dit ce qu'il a retiré, inconnu ≠ non. Cette ESN
 * échoue-t-elle « tient le rang 2 quelque part » PARCE QUE son rang n'a
 * jamais été mesuré dans l'espace (aucune présence sur aucun compte), ou
 * parce que sa présence est connue et n'est simplement PAS au rang 2 (un
 * « non » mesuré, pas une absence de mesure) ? `rank` est un champ
 * OBLIGATOIRE de `account_partners` (`RawAccountPartnerRow.rank`) : dès
 * qu'une présence existe, son rang est connu — seule l'ABSENCE TOTALE de
 * présence (`coverage === 0`, `buildPartnerCoverageIndex`) reste « inconnu »
 * au sens de la doctrine (GA-18/GA-19).
 */
export function isRank2OpeningUnknown(
  candidateName: string,
  relationIndex: ReadonlyMap<string, PartnerRelationSummary>,
  coverageIndex: ReadonlyMap<string, number>,
): boolean {
  const key = normalizePartnerName(candidateName)
  const summary = relationIndex.get(key)
  if ((summary?.rank2 ?? 0) > 0) return false
  return (coverageIndex.get(key) ?? 0) === 0
}

/** #2165.56 / #2151.34 — les trois états qu'UNE LIGNE affiche pour le rang 2,
 *  jamais fondus en un booléen. */
export type PartnerRank2Status = 'declared' | 'observed' | 'unknown'

/**
 * #2165.56 — DOCTRINE #2298.9 : une ESN OBSERVÉE en rang 2 sur un dossier de
 * l'espace (`relationIndex`, agrégat `account_partners`) n'implique PAS
 * qu'elle ACCEPTE le rang 2 en général — c'est l'ESN elle-même qui le dit,
 * ailleurs, via `esn_directory.open_to_subcontracting` (agrégat communautaire
 * ≥ 3 espaces, `GET /partners/profile-matches`, jamais semé en démo : D589-
 * D593, migration `1790900000008-EsnSubcontractingDeclarations`). `declared`
 * prime sur `observed` quand les deux sont vrais — c'est le signal le plus
 * large, jamais contredit par un fait plus étroit.
 */
export function rank2StatusFor(
  candidateName: string,
  relationIndex: ReadonlyMap<string, PartnerRelationSummary>,
  declaredIndex: ReadonlyMap<string, boolean>,
): PartnerRank2Status {
  const key = normalizePartnerName(candidateName)
  if (declaredIndex.get(key)) return 'declared'
  if ((relationIndex.get(key)?.rank2 ?? 0) > 0) return 'observed'
  return 'unknown'
}

/**
 * #2165.56 — l'index nom normalisé → déclaré, depuis `GET
 * /partners/profile-matches` (`ProfileMatchEsn`, référentiel ESN PARTAGÉ,
 * agrégat communautaire ≥ 3 espaces, D589-D593). Seul `'oui'` compte : `'non'`
 * et `'inconnu'` ne sont pas une preuve — même règle que
 * `applyDeclaredSubcontracting` côté API (`declared-subcontracting.ts`), pour
 * ne jamais diverger de ce que l'écran compte partenaire affirme déjà.
 */
export function buildDeclaredRank2Index(
  matches: readonly { name: string; openToSubcontracting: string }[],
): Map<string, boolean> {
  const index = new Map<string, boolean>()
  for (const match of matches) {
    if (match.openToSubcontracting === 'oui') index.set(normalizePartnerName(match.name), true)
  }
  return index
}

export type RelationChipKey = 'existingRelationship' | 'rank2Opening' | 'observedClients'

export interface RelationChipImpact {
  readonly key: RelationChipKey
  /** Combien d'ESN ce chip, À LUI SEUL, a retirées du pool commun. */
  readonly removedCount: number
  /** Parmi elles, combien l'ont été faute de savoir — jamais parce qu'on
   *  sait « non » (GA-18/GA-19). Toujours ≤ `removedCount`. */
  readonly unknownCount: number
}

/**
 * #2151.33 / #2151.34 — le filtre dit ce qu'il a retiré, inconnu ≠ non.
 * DÉCISION Louis 18/09 (registre #2151.34) : « une valeur non mesurée n'est
 * jamais comptée « non » : elle reste « inconnu », et le filtre le dit. »
 * Défaut mesuré en prod le 18/09 : preset « Trouver des partenaires ou ESN »
 * trouvait 7 ESN ; le chip « Relation déjà qualifiée » les retirait TOUTES
 * (relation `unknown` partout) et l'écran rendait `partners.empty`
 * (« aucune ESN dans cette recherche ») — un mensonge : la recherche EN
 * avait trouvé 7, c'est le filtre qui les a retirées. Cette fonction compte
 * ce que `passesExistingRelationship`/`passesRank2Opening`/
 * `passesObservedClients` retirent silencieusement, pour que l'écran
 * puisse le dire plutôt que de le taire.
 *
 * `candidates` est le pool AVANT ces trois chips (après les autres filtres,
 * cf. le pool passé à `visible` dans `Discover.tsx`) : chaque chip est
 * évalué INDÉPENDAMMENT sur ce même pool, jamais en chaîne — sans quoi le
 * second chip actif hériterait du retrait du premier et sous-compterait son
 * propre effet.
 */
export function buildRelationChipImpacts(
  candidates: readonly { name: string }[],
  chips: {
    readonly existingRelationshipOnly: boolean
    readonly rank2OpeningOnly: boolean
    readonly observedClientsOnly: boolean
  },
  relationIndex: ReadonlyMap<string, PartnerRelationSummary>,
  coverageIndex: ReadonlyMap<string, number>,
): RelationChipImpact[] {
  const impacts: RelationChipImpact[] = []

  if (chips.existingRelationshipOnly) {
    const removed = candidates.filter(c => !passesExistingRelationship(c.name, true, relationIndex))
    impacts.push({
      key: 'existingRelationship',
      removedCount: removed.length,
      unknownCount: removed.filter(c => isExistingRelationshipUnknown(c.name, relationIndex)).length,
    })
  }

  if (chips.rank2OpeningOnly) {
    const removed = candidates.filter(c => !passesRank2Opening(c.name, true, relationIndex))
    impacts.push({
      key: 'rank2Opening',
      removedCount: removed.length,
      unknownCount: removed.filter(c => isRank2OpeningUnknown(c.name, relationIndex, coverageIndex)).length,
    })
  }

  if (chips.observedClientsOnly) {
    const removed = candidates.filter(c => !passesObservedClients(c.name, true, relationIndex))
    // #2151.32 — `passesObservedClients` ne retire JAMAIS faute de savoir :
    // `unresolvedAtAccounts > 0` suffit à GARDER (voir la fonction plus
    // haut) — ce qu'il retire est donc toujours un « non » résolu, jamais
    // un inconnu (doctrine c65/GA-259).
    impacts.push({ key: 'observedClients', removedCount: removed.length, unknownCount: 0 })
  }

  return impacts
}

const EARTH_RADIUS_KM = 6371

function distanceKm(a: readonly [number, number], b: readonly [number, number]): number {
  const rad = (deg: number) => (deg * Math.PI) / 180
  const dLat = rad(b[0] - a[0])
  const dLng = rad(b[1] - a[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}

/**
 * #4627 — revient sur GA-275, décision Louis 31/10 : le RAYON prime sur le nom. Avec un rayon, toute commune dont
 * les coordonnées sont CONNUES et qui tombe dans le cercle de la ville cherchée est gardée ; hors du cercle elle
 * reste écartée. #5069 — les coordonnées viennent du référentiel de TOUTES les communes (`commune-coordinates`) ;
 * un homonyme se résout par le département quand on l'a (celui de la fiche, celui du filtre s'il est unique), sinon
 * rien. Coordonnées inconnues d'un côté ou de l'autre (ou « ville exacte ») : la règle du nom, jamais une distance
 * devinée.
 */
function passesCity(
  candidate: DiscoverCandidate,
  city: string,
  radiusKm: CityRadiusOption = 'any',
  department = '',
): boolean {
  const wanted = city.trim().toLowerCase()
  if (!wanted) return true
  const value = (candidate.city ?? '').toLowerCase()
  if (!value) return true
  if (value.includes(wanted)) return true
  if (radiusKm === 'any') return false
  const centerDepartments = parseDepartments(department)
  const center = knownCityCoordinates(city, centerDepartments.length === 1 ? centerDepartments[0] : null)
  const place = knownCityCoordinates(candidate.city ?? '', candidate.department)
  if (!center || !place) return false
  return distanceKm(center, place) <= Number(radiusKm)
}

/**
 * #4646.5 — le compte est sorti PAR une offre située dans la ville cherchée : la zone est satisfaite par la
 * preuve, même quand le siège est ailleurs (« Lille » ne rend pas un dossier cadré sur le siège de Compiègne).
 * Sans ville posée ou sans offre localisée : faux (rien ne se devine).
 */
function offerProvesCity(candidate: Pick<DiscoverCandidate, 'skillEvidence'>, city: string): boolean {
  const wanted = foldSkillText(city.trim())
  const evidence = candidate.skillEvidence
  if (!wanted || !evidence) return false
  const cities = [...(evidence.offers ?? []).map(offer => offer.city), evidence.latestOffer.city]
  return cities.some(value => value && foldSkillText(value).includes(wanted))
}

/** Les trois critères qu'une carte cible peut dire avoir satisfaits. */
type MatchedSearchCriterion = 'sector' | 'zone' | 'headcount' | 'skills' | 'keyword'

function foldSkillText(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

const WORD_SPLIT = /[^a-z0-9+#.]+/

function foldedWords(value: string): string[] {
  return value
    .split(WORD_SPLIT)
    .map(term => term.replace(/^\.+|\.+$/g, ''))
    .filter(Boolean)
}

/**
 * Les compétences posées : un segment séparé par virgule/point-virgule qui porte un « & » est un LIBELLÉ composite
 * (« Data & IA », #5214) = UN critère, qui exige tous ses mots ; le reste du texte se découpe en mots (3 lettres au
 * moins), comme un texte saisi à la main.
 */
function skillCriteria(
  filters: Pick<UnifiedFilters, 'freetext' | 'technologiesObserved'>,
): { term: string; words: string[] }[] {
  const out: { term: string; words: string[] }[] = []
  for (const segment of foldSkillText(`${filters.freetext},${filters.technologiesObserved}`).split(/[,;]+/)) {
    if (segment.includes('&')) {
      const words = foldedWords(segment)
      const term = words.join(' & ')
      if (words.length > 0 && !out.some(entry => entry.term === term)) out.push({ term, words })
      continue
    }
    for (const word of foldedWords(segment)) {
      if (word.length >= 3 && !out.some(entry => entry.term === word)) out.push({ term: word, words: [word] })
    }
  }
  return out
}

/**
 * #3819 — les compétences saisies en texte libre RELIÉES aux signaux : un mot posé
 * par l'utilisateur est nommé quand un signal du candidat le porte tel quel
 * (titre, détail ou technologies nommées) — un MOT ENTIER, jamais une sous-chaîne
 * (« java » ≠ « javascript »). Aucun signal ou aucun mot posé = rien.
 */
function matchedSkillTerms(candidate: Pick<DiscoverCandidate, 'signals'>, filters: UnifiedFilters): string[] {
  const terms = skillCriteria(filters)
  if (terms.length === 0) return []
  const haystack = candidate.signals
    .map(signal => foldSkillText([signal.label, signal.detail ?? '', ...(signal.technologies ?? [])].join(' ')))
    .join(' | ')
  if (!haystack) return []
  const words = new Set(haystack.split(/[^a-z0-9+#.]+/).map(word => word.replace(/^\.+|\.+$/g, '')))
  return terms.filter(criterion => criterion.words.every(word => words.has(word))).map(criterion => criterion.term)
}

/**
 * KEVIN-FIX K.4 — les compétences saisies PÈSENT dans le rang : le compte dont un signal/une offre CITE
 * la techno (mot entier) passe avant celui qui ne la cite pas, le plus de compétences citées d'abord.
 * Passe STABLE : l'ordre du tri est conservé dans chaque palier, rien n'est retiré, et sans compétence
 * saisie la liste est rendue telle quelle. Le tri CHOISI (Taille…) n'y passe pas : l'appelant le garde.
 */
export function skillCitationFirst<T extends DiscoverCandidate>(list: readonly T[], filters: UnifiedFilters): T[] {
  if (skillCriteria(filters).length === 0) return [...list]
  const cited = new Map(list.map(candidate => [candidate, matchedSkillTerms(candidate, filters).length] as const))
  return [...list].sort((a, b) => (cited.get(b) ?? 0) - (cited.get(a) ?? 0))
}

/**
 * #3819.1 — « le lien avec les critères/compétences saisis », sur la carte
 * cible AVANT analyse : UN fait du candidat comparé à UN critère RÉELLEMENT
 * posé par l'utilisateur — jamais un lien inventé pour un critère qu'il n'a
 * pas saisi.
 *
 * Réutilise EXACTEMENT les croisements déjà écrits pour le filtrage d'écran
 * (`passesSectors`, `passesCity`, `passesDepartment`, `passesHeadcount`,
 * GA-26) : une correspondance recalculée ici pourrait diverger de celle qui
 * décide déjà si la carte reste visible.
 */
export function matchedSearchCriteria(candidate: DiscoverCandidate, filters: UnifiedFilters): MatchedSearchCriterion[] {
  const matched: MatchedSearchCriterion[] = []
  if (
    (activeSectors(filters.sectors).length > 0 || filters.nafCode.trim()) &&
    passesSectors(candidate, filters.sectors, filters.nafCode)
  ) {
    matched.push('sector')
  }
  if (
    (filters.city.trim() || filters.department.trim()) &&
    ((passesCity(candidate, filters.city, filters.cityRadiusKm, filters.department) &&
      passesDepartment(candidate, filters.department)) ||
      offerProvesCity(candidate, filters.city))
  ) {
    matched.push('zone')
  }
  if (filters.headcount.length > 0 && passesHeadcount(candidate, filters.headcount)) {
    matched.push('headcount')
  }
  if (matchedSkillTerms(candidate, filters).length > 0) matched.push('skills')
  // #4045.1 — le mot-clé de la recherche, nommé quand un signal du compte le recoupe
  // (drapeau posé par le serveur, un seul lexique — rien n'est recalculé ici).
  if (filters.keywords.trim() && candidate.signals.some(signal => signal.keywordMatch === true)) matched.push('keyword')
  return matched
}

const REGION_NAMES = new Map(ZONE_REGIONS.map(([code, name]) => [code, name]))
const DEPARTMENT_NAMES = new Map(ZONE_DEPARTMENTS.map(([code, name]) => [code, name]))
const REGION_OF_DEPARTMENT = new Map(ZONE_DEPARTMENTS.map(([code, , region]) => [code, region]))

/** #4432.2 — `geography` n'existe que sans zone vide ET quand la source prouve le siège ou un établissement dans la zone. */
function registryProvesPresenceInZone(candidate: DiscoverCandidate): boolean {
  const geography = candidate.geography
  return geography !== undefined && (geography.basis === 'headquarters' || geography.siteCount > 0)
}

/** #4432.3 — le compte est-il dans une des régions cherchées ? Un département inconnu ne prouve rien :
 *  le registre a déjà filtré sur la région, le compte est gardé. Un département CONNU hors région dit non. */
function inSearchedRegions(candidate: DiscoverCandidate, regions: readonly string[]): boolean {
  // #4432.2 — le registre PROUVE une implantation dans la zone (siège ou établissements) : le `department`
  // du compte est celui du SIÈGE (Saint-Cloud, 92), il ne dit pas où sont les sites de la zone cherchée.
  if (registryProvesPresenceInZone(candidate)) return true
  const department = (candidate.department ?? '').trim().toUpperCase()
  if (!department) return true
  const region = REGION_OF_DEPARTMENT.get(department)
  return region === undefined || regions.includes(region)
}

/** #4646 — les offres DATÉES que la carte de Découvrir porte en preuve (jamais une date inventée : sans date, sans `date`). */
function skillEvidenceOffers(
  candidate: Pick<DiscoverCandidate, 'skillEvidence'>,
  seen: string,
): { skill: string; offers: NonNullable<DiscoverOriginCriteria['offers']> } {
  const evidence = candidate.skillEvidence
  if (!evidence) return { skill: '', offers: [] }
  const iso = /^\d{4}-\d{2}-\d{2}$/
  const raw = evidence.offers?.length
    ? evidence.offers
    : [
        {
          title: evidence.latestOffer.title ?? undefined,
          date: evidence.latestOffer.date ?? undefined,
          url: evidence.latestOffer.url ?? undefined,
        },
      ]
  const offers = raw.flatMap(offer => {
    const title = (offer.title ?? '').trim().slice(0, 160)
    if (!title) return []
    const date = offer.date?.slice(0, 10)
    // #4646.2 — le lien de l'annonce suit l'offre (http(s) seulement ; une adresse illisible n'est pas portée).
    const url = (offer.url ?? '').trim()
    return [
      {
        title,
        ...(date && iso.test(date) ? { date } : {}),
        ...(/^https?:\/\/\S+$/i.test(url) && url.length <= 500 ? { url } : {}),
        ...(iso.test(seen) ? { seen } : {}),
      },
    ]
  })
  return { skill: evidence.skill.trim().slice(0, 60), offers: offers.slice(0, 10) }
}

/**
 * #3819 (lot RBB, décision Louis 11/10) — les critères qui SUIVENT le compte
 * jusqu'à l'analyse puis le dossier : les axes que `matchedSearchCriteria`
 * nomme déjà sur la carte (MÊMES croisements, GA-26), avec les VALEURS posées,
 * plus les sources de signal cochées dont le candidat porte un signal. Rien de
 * posé ou rien de satisfait = `undefined` — jamais un critère inventé.
 */
export function discoverOriginCriteriaFor(
  candidate: DiscoverCandidate,
  filters: UnifiedFilters,
  today: string = new Date().toISOString().slice(0, 10),
): DiscoverOriginCriteria | undefined {
  const matched = matchedSearchCriteria(candidate, filters)
  const criteria: DiscoverOriginCriteria = {}
  const sectors = activeSectors(filters.sectors)
  if (matched.includes('sector') && sectors.length > 0) criteria.sectors = sectors
  if (matched.includes('zone')) {
    criteria.zone = [filters.city.trim(), filters.department.trim()].filter(Boolean).join(' · ')
    // #4432.3 — la zone STRUCTURÉE, en libellés : elle devient le périmètre du dossier
    // (`geoScopeFromOriginCriteria`). Un code de département inconnu du référentiel ne se nomme pas.
    if (filters.city.trim()) criteria.zone_city = filters.city.trim()
    const departments = parseDepartments(filters.department).flatMap(code => {
      const name = DEPARTMENT_NAMES.get(code)
      return name ? [name] : []
    })
    if (departments.length > 0) criteria.zone_departments = departments
  } else if (filters.region.length > 0 && inSearchedRegions(candidate, filters.region)) {
    // #4432.3 — la RÉGION cherchée (une ou plusieurs) suit aussi le compte : elle n'en sortait pas.
    const regions = filters.region.flatMap(code => {
      const name = REGION_NAMES.get(code)
      return name ? [name] : []
    })
    if (regions.length > 0) {
      criteria.zone = regions.join(' · ')
      criteria.zone_regions = regions
    }
  }
  // #4433.9 (re-recette 26/10) — un compte sorti par l'ÉLARGISSEMENT de zone garde son palier, nommé jusqu'au dossier.
  const zone = candidate.zone
  if (zone && zone.tier !== 'city' && zone.place?.trim()) {
    criteria.zone_widened = {
      tier: zone.tier,
      place: zone.place.trim(),
      ...(zone.area ? { area: zone.area } : {}),
      ...(zone.distanceKm !== undefined ? { distance_km: zone.distanceKm } : {}),
    }
  }
  const headcount = activeHeadcountRanges(filters.headcount)
  if (matched.includes('headcount') && headcount.length > 0) criteria.headcount = headcount
  // #3941.5 — `capital` (augmentation de capital) porte un signal de type `business` : il n'a pas de type
  // propre à recouper ici, le signal daté se lit sur la carte elle-même (#4732.1 : `deal` de même).
  const signals = activeSignalSources(filters)
    .filter((source): source is Exclude<SignalSource, 'capital' | 'deal'> => source !== 'capital' && source !== 'deal')
    .filter(source => candidate.signals.some(s => s.type === source))
  if (signals.length > 0) criteria.signals = signals
  // #3819 (lot W-C 13/10) — la compétence cherchée suit le compte : les mots posés
  // que `matchedSkillTerms` retrouve dans un signal du candidat (le même croisement
  // que « Correspond à : compétence », GA-26) — jamais un mot qu'il ne porte pas.
  const skills = matchedSkillTerms(candidate, filters).slice(0, 20)
  if (skills.length > 0) criteria.skills = skills
  // #4646 (Louis 27/10) — les offres qui ont fait SORTIR le compte suivent jusqu'au dossier : recopiées avec leur
  // date et le jour où l'écran les a montrées. La compétence de la preuve rejoint les compétences cherchées.
  const proof = skillEvidenceOffers(candidate, today)
  if (proof.offers.length > 0) {
    criteria.offers = proof.offers
    if (proof.skill && !(criteria.skills ?? []).some(s => s.toLowerCase() === proof.skill.toLowerCase())) {
      criteria.skills = [...(criteria.skills ?? []), proof.skill].slice(0, 20)
    }
  }
  return Object.keys(criteria).length > 0 ? criteria : undefined
}

/** Le candidat atteint-il le palier de fit demandé ? `any` accepte tout, y
 *  compris un fit non mesurable. Appliqué en DIRECT à l'écran (le fit est un
 *  calcul déterministe sur le score déjà rendu — inutile de relancer). */
export function passesFit(candidate: DiscoverCandidate, fit: FitFilter): boolean {
  if (fit === 'any') return true
  if (fit === 'high') return isHighPotential(candidate)
  const tier = fitTierFor(candidate)
  return tier === 'high' || tier === 'medium' // fit === 'medium'
}

/**
 * Croise les contraintes STRUCTURÉES du rail que la source PRIMAIRE n'a pas
 * honorées nativement, sur les faits réels de chaque candidat.
 *
 *  - En mode Registre, le backend a déjà appliqué secteur/zone/effectif/âge (et
 *    quand il ne le peut pas, il rend une liste plus large ET le dit à côté du
 *    filtre — comportement délibéré qu'on ne réécrit pas ici). Rien à croiser :
 *    la liste repart telle quelle.
 *  - En mode Signaux, la source n'a filtré que la zone et la fraîcheur : le
 *    secteur, le CODE NAF saisi, l'effectif, l'ancienneté et la ville se
 *    croisent ICI, sur les faits registre déjà résolus pour chaque candidat —
 *    c'est ce qui rend « signal × secteur » exprimable sans fabriquer aucune
 *    donnée.
 *
 * Toujours NON DESTRUCTIF : un candidat dont le fait manque n'est jamais écarté
 * (on ne contredit pas une absence de donnée — « un filtre absent n'est pas
 * contraignant » vaut aussi côté candidat).
 *
 * ⚠️ #1766 — CE QUI NE SE CROISE PAS ICI, ET POURQUOI. Région, catégorie
 * d'entreprise, chiffre d'affaires et forme juridique sont visibles au rail dans
 * les DEUX modes, et le serveur des signaux ne les accepte pas
 * (`DiscoverSignalsRequest` ne les déclare pas). Ils ne sont pas croisés ici non
 * plus, et ce n'est pas un oubli : **un candidat de signal ne porte AUCUN de ces
 * quatre faits** (`DiscoverCandidate` a un NAF, une ville, un département, une
 * tranche d'effectif et une date de création — rien d'autre). Les déduire
 * — « 200 salariés donc PME » — fabriquerait une donnée : la catégorie INSEE
 * croise effectif, chiffre d'affaires ET bilan. Le rail le DIT donc à côté du
 * champ, comme il le fait déjà pour les mots-clés en mode Registre : un critère
 * qui n'agit pas sans le dire est indiscernable d'un critère cassé.
 */
export function applyRailConstraints(
  candidates: readonly DiscoverCandidate[],
  filters: UnifiedFilters,
  mode: 'registry' | 'signals',
  nowMs: number = Date.now(),
  /** #3528.3 — les contacts connus de l'espace, par entreprise. */
  knownLevels?: KnownContactLevels,
): DiscoverCandidate[] {
  // #2165.27 / #2165.24 — les EXCLUSIONS et le GROUPE/FILIALE n'ont
  // d'équivalent NULLE PART, ni au registre ni aux sources de signal : à la
  // différence des contraintes ci-dessous, ils se croisent donc dans LES
  // DEUX MODES.
  const withoutExcluded = candidates
    // #2291.2 — EN PREMIER : `contractRecourseImpact` compte sur ce même pool.
    .filter(candidate => passesContractRecourse(candidate, filters.contractRecourseObserved))
    .filter(candidate => passesExclusions(candidate, filters.excludeSectors))
    .filter(candidate => passesEndClientsOnly(candidate, filters.entityType))
    .filter(candidate => passesPublicEmployerExclusion(candidate, filters.excludePublicEmployers))
    // #2616.1 — même statut qu'`excludePublicEmployers` juste au-dessus : aucune
    // source ne l'exprime en requête, croisé À L'ÉCRAN dans LES DEUX MODES, sur
    // le même fait déjà résolu par un signal `hiring`.
    .filter(candidate => passesCdiOnly(candidate, filters.cdiOnly))
    .filter(candidate => passesFreelanceOnly(candidate, filters.freelanceOnly))
    .filter(candidate => passesContractOnly(candidate, 'CDD', filters.cddOnly))
    .filter(candidate => passesContractOnly(candidate, 'INTERIM', filters.interimOnly))
    .filter(candidate => passesRemotePolicy(candidate, filters.remotePolicies))
    .filter(candidate => passesSeniority(candidate, filters.seniorities))
    .filter(candidate => passesDecisionLevel(candidate, filters.decisionLevels, knownLevels))
    .filter(candidate => passesDeliveryFit(candidate, filters.deliveryFitFilter))
    .filter(candidate => passesGroupRole(candidate, filters.groupRole))
    // #4294.7 — dans les DEUX modes, en ET avec le secteur croisé plus bas.
    .filter(candidate => passesWorked(candidate, filters.workedOnly))
    // #3941.5 (R41) — « Augmentation de capital » SEUL coché : seuls les comptes qui portent le signal daté restent.
    .filter(candidate => !isCapitalIncreaseOnly(filters) || hasCapitalIncreaseSignal(candidate))
    // #4732.1 — « Rachat ou fusion » SEUL coché : même règle.
    .filter(candidate => !isTakeoverOnly(filters) || hasTakeoverSignal(candidate))
  // Le registre a filtré server-side — la liste est déjà croisée (ou volontairement
  // plus large, avec sa note). On n'y retouche pas au-delà des exclusions.
  if (mode === 'registry') return withoutExcluded
  const sectors = activeSectors(filters.sectors)
  return withoutExcluded.filter(
    candidate =>
      passesSectors(candidate, sectors, filters.nafCode) &&
      passesHeadcount(candidate, filters.headcount) &&
      passesAge(candidate, filters.age, nowMs) &&
      passesDepartment(candidate, filters.department) &&
      passesCity(candidate, filters.city, filters.cityRadiusKm, filters.department),
  )
}
