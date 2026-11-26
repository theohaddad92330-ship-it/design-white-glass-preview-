import { CRITERIA_WIDEN_MIN_RESULTS, widenToThreshold, type SurfaceWidening } from '@bellum/contracts'
import type { WatchlistRule } from '@bellum/contracts'
import {
  applyHiringDomain,
  countWatchlistFacets,
  countWatchlistTypeFacets,
  effectiveFilters,
  effectiveTypeFacets,
  filterWatchlistByTypes,
  filterWatchlistItems,
  groupWatchlistByAccount,
  hasUsableSignal,
  WATCHLIST_DEFAULT_FILTERS,
  type WatchlistAccountGroup,
  type WatchlistFilterKey,
  type WatchlistItem,
  type WatchlistTypeFacet,
} from './watchlist'

type Profile = Parameters<typeof applyHiringDomain>[1]

interface WatchlistViewState {
  active: ReadonlySet<WatchlistFilterKey>
  activeTypes: ReadonlySet<WatchlistTypeFacet>
  query: string
  rules: WatchlistRule[]
  profile: Profile
  /** « Revenir au strict » : la vue exacte, sans palier (le geste de retour du bandeau). */
  strict?: boolean
}

/** Un passage du plateau : filtres → types → libellés de profil → une ligne par compte (UN chemin, GA-26). */
function strictView(items: WatchlistItem[], state: WatchlistViewState) {
  const { active, activeTypes, query, rules, profile } = state
  const facetCounts = countWatchlistFacets(items, { query, rules, profile })
  const applied = effectiveFilters(active, facetCounts)
  const filteredItems = filterWatchlistItems(items, { active: applied, query, rules })
  const typeCounts = countWatchlistTypeFacets(filteredItems, profile)
  const appliedTypes = effectiveTypeFacets(activeTypes, typeCounts)
  const typedItems = filterWatchlistByTypes(filteredItems, appliedTypes, profile)
  const { items: labelledItems, notice } = applyHiringDomain(typedItems, profile)
  const allGroups = groupWatchlistByAccount(labelledItems, profile, appliedTypes, rules).filter(group =>
    hasUsableSignal(group.latest),
  )
  return {
    facetCounts,
    applied,
    typeCounts,
    appliedTypes,
    notice,
    groups: allGroups.filter(group => group.discardReason === null),
    discarded: allGroups.filter(group => group.discardReason !== null),
  }
}

/** La personne a-t-elle bougé quoi que ce soit à l'arrivée (puce d'intention ou de type, recherche) ? */
function isTouched({ active, activeTypes, query }: WatchlistViewState): boolean {
  const atDefault =
    active.size === WATCHLIST_DEFAULT_FILTERS.size && [...active].every(key => WATCHLIST_DEFAULT_FILTERS.has(key))
  return !atDefault || activeTypes.size > 0 || query.trim().length > 0
}

interface WatchlistView extends ReturnType<typeof strictView> {
  /** Ce que le plateau a élargi SEUL, ou `null` (au seuil, ou rien à ajouter). */
  widening: SurfaceWidening | null
}

/**
 * #4433.9 (épopée #4433, Louis 21/10/2026) — MES CIBLES ET LA VEILLE S'ÉLARGISSENT SEULES.
 *
 * Sous `CRITERIA_WIDEN_MIN_RESULTS` comptes, le plateau ne reste pas sur un écran maigre ni vide : palier 1,
 * le filtre d'intention tombe (« À traiter » → aussi les comptes déjà traités) ; palier 2, le filtre de type
 * tombe aussi. Les comptes exacts restent en tête, ceux que les paliers ajoutent viennent dessous, et le
 * palier atteint se DIT (`widening`). Un palier qui n'ajoute rien n'est pas une étape.
 *
 * Ce qui ne s'élargit PAS : tout ce que la personne a posé elle-même (une puce, un type, la recherche — un
 * geste, pas un défaut ; une puce à 0 ne s'applique d'ailleurs déjà pas, #4088.5) et « Écartés (N) » (le bruit
 * reconnu — stage, presse générale — reste sous son dépliant). Les puces (`facetCounts`, `typeCounts`) restent
 * celles de la vue stricte : elles disent ce que le filtre retient, pas ce que l'élargissement a ajouté.
 */
export function buildWatchlistView(items: WatchlistItem[], state: WatchlistViewState): WatchlistView {
  const strict = strictView(items, state)
  // Un filtre POSÉ par la personne est un geste, pas un défaut : on ne le défait pas derrière son dos.
  if (state.strict || isTouched(state)) return { ...strict, widening: null }
  const { items: groups, steps } = widenToThreshold<WatchlistAccountGroup>(
    [() => strict.groups, () => strictView(items, { ...state, active: new Set() }).groups],
    ['watch_intent'],
    group => group.accountId,
  )
  return {
    ...strict,
    groups,
    widening: steps.length > 0 ? { minResults: CRITERIA_WIDEN_MIN_RESULTS, steps } : null,
  }
}
