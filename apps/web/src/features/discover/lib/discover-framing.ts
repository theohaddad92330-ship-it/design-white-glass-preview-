import type { DiscoverCandidate } from './discover-types'
import { countActiveFilters, type FitFilter, type UnifiedFilters } from './discover-filters'

/* ------------------------------------------------------------------ */
/*  #4494 (Louis 24/10) — « Cadrer la recherche » : les RUBRIQUES de la  */
/*  modale V22, et la place de CHAQUE filtre d'avant dans l'une d'elles. */
/*                                                                     */
/*  Les cinq premières sont celles de la maquette, dans son ordre ; la   */
/*  sixième (« Taille & structure ») porte ce que la maquette n'a pas    */
/*  (taille maison TPE/PME/ETI/GC, middle market, cotées, startup,       */
/*  groupe/filiale) — « s'il manque des onglets, rajoute-les ».          */
/* ------------------------------------------------------------------ */

export const FRAMING_SECTIONS = ['companies', 'territory', 'expertise', 'signals', 'relation', 'size'] as const
export type FramingSection = (typeof FRAMING_SECTIONS)[number]

/** Les réglages de la modale qui vivent HORS de `UnifiedFilters` (affinages d'écran, panneau Partenaires). */
type FramingExtraKey =
  | 'fit'
  | 'minAccountsSeen'
  | 'existingRelationshipOnly'
  | 'rank2OpeningOnly'
  | 'observedClientsOnly'
  | 'expertiseKnownOnly'
  | 'complementarityKnownOnly'

/**
 * LA PREUVE COMPTÉE (#4494.4) — chaque filtre de l'ancien `FilterRail` (ligne rapide, puces ET modale) et la
 * rubrique qui le porte désormais. Aucun n'est perdu : `discover-framing.test.ts` vérifie que chaque clé de
 * `UnifiedFilters` posée par le rail figure ici, et le test de la modale que chaque rubrique rend ses champs.
 */
export const FRAMING_FIELDS: Readonly<Record<FramingSection, readonly (keyof UnifiedFilters | FramingExtraKey)[]>> = {
  companies: [
    'entityType',
    'sectors',
    'excludeSectors',
    'workedOnly',
    'nafCode',
    'age',
    'legalForm',
    'revenueMin',
    'revenueMax',
  ],
  territory: ['city', 'cityRadiusKm', 'department', 'siteBasis', 'region'],
  // #4632 — la famille de rôles et l'écosystème observés, venus du panneau « Contexte marché observé » retiré.
  expertise: [
    'keywords',
    'technologiesObserved',
    'externalRecourseObserved',
    'contractRecourseObserved',
    'roleFamilyObserved',
    'ecosystemObserved',
    // #5203 — période et nature des besoins : des filtres qui RETIRENT.
    'needsPeriod',
    'needsNature',
  ],
  signals: [
    'signalSources',
    'sinceDays',
    'cdiOnly',
    'freelanceOnly',
    'cddOnly',
    'interimOnly',
    'remotePolicies',
    'seniorities',
    'deliveryFitFilter',
  ],
  relation: [
    'decisionLevels',
    'fit',
    'minAccountsSeen',
    'existingRelationshipOnly',
    'rank2OpeningOnly',
    'observedClientsOnly',
    'expertiseKnownOnly',
    'complementarityKnownOnly',
  ],
  size: ['headcount', 'excludeListed', 'groupRole'],
}

/**
 * Les clés de `UnifiedFilters` qu'AUCUNE rubrique ne porte, chacune avec sa raison — jamais un oubli :
 * - `freetext` : la saisie libre de la page (« Quel marché veux-tu explorer ? »), pas un critère de la modale ;
 * - `excludePublicEmployers` : posé par un préréglage seulement, jamais exposé au rail (#2616.2) ;
 * - `companyCategory` : remplacé par le filtre de taille unique (#4362.2), plus rendu nulle part avant ce lot.
 */
export const FRAMING_OUTSIDE_FIELDS: readonly (keyof UnifiedFilters)[] = [
  'freetext',
  'excludePublicEmployers',
  'companyCategory',
]

export interface FramingExtras {
  fit: FitFilter
  minAccountsSeen: number | null
  existingRelationshipOnly: boolean
  rank2OpeningOnly: boolean
  observedClientsOnly: boolean
  expertiseKnownOnly: boolean
  complementarityKnownOnly: boolean
}

/** #4493 — ouvrir la modale depuis la page (une piste) : sa rubrique, un brouillon pré-rempli ; chaque `nonce` ouvre une fois. */
export interface FramingOpenRequest {
  section: FramingSection
  patch?: Partial<UnifiedFilters>
  nonce: number
}

/**
 * #4607.2 / #4607.3 — LE lecteur unique du compteur de critères (GA-26) : le badge de « Tous les filtres » et la
 * phrase du pied de la modale lisaient deux sommes différentes (le pied ajoutait l'affinage `fit`, le badge non),
 * donc « 1 » d'un côté et « Aucun critère » de l'autre. Un réglage vit à UN endroit : ici.
 */
export function countFramingCriteria(filters: UnifiedFilters, extras: FramingExtras): number {
  return countActiveFilters(filters) + (extras.fit !== 'any' ? 1 : 0)
}

export function sameFramingExtras(a: FramingExtras, b: FramingExtras): boolean {
  return (Object.keys(a) as (keyof FramingExtras)[]).every(key => a[key] === b[key])
}

/**
 * « N comptes dans la sélection » (#4494.3), recalculé en direct SANS AUCUN APPEL (le contrat du lot interdit
 * d'en changer) : sur les comptes DÉJÀ chargés, ce que le cadrage en cours retient.
 *
 * - `draftKept` : ce que les contraintes d'écran du brouillon gardent (même pipeline que l'écran, fit compris) ;
 * - `activeKept` : la même chose pour la recherche affichée ;
 * - `visible` : ce que l'écran affiche vraiment (affinages de la barre de résultats compris).
 *
 * Un compte que les deux retiennent compte s'il est affiché ; un compte que SEUL le brouillon fait entrer
 * compte (les affinages de la barre ne l'ont jamais vu). Brouillon = recherche affichée ⇒ exactement
 * `visible.length`.
 */
export function framingLoadedCount(
  draftKept: readonly Pick<DiscoverCandidate, 'siren'>[],
  activeKept: readonly Pick<DiscoverCandidate, 'siren'>[],
  visible: readonly Pick<DiscoverCandidate, 'siren'>[],
): number {
  const active = new Set(activeKept.map(candidate => candidate.siren))
  const shown = new Set(visible.map(candidate => candidate.siren))
  return draftKept.filter(candidate => (active.has(candidate.siren) ? shown.has(candidate.siren) : true)).length
}
