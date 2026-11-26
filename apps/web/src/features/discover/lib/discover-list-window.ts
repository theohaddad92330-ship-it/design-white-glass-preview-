import { DISCOVER_MAX_LIMIT } from '@bellum/contracts'
import type { DiscoverRequest } from '@/features/discover/hooks/useDiscoverSearch'
import { countHighPotential } from './discover-ranking'
import { DISCOVER_PAGE_SIZE } from './discover-query'
import type { DiscoverCandidate } from './discover-types'

/**
 * #3597.5 — « 10 comptes par défaut + Voir 10 de plus » (décision Louis
 * 04/10/2026). La liste de /discover révèle d'abord les dix premiers comptes
 * déjà chargés ; « Voir 10 de plus » en révèle dix autres (gratuit, instantané).
 * Quand tous les comptes CHARGÉS sont visibles et que la recherche peut en
 * rendre plus, le même bouton relance la requête avec un `limit` plus grand,
 * borné par `DISCOVER_MAX_LIMIT` — aucun nouveau contrat d'API.
 *
 * #4016 L7 — décision Louis 11/10/2026 : Découvrir SANS PALIER. Le volume de
 * la capacité commerciale (10 / 25 / 50) n'est qu'un premier lot ; la borne
 * `DISCOVER_MAX_LIMIT` est passée de 50 (le plus haut palier) à 200, une borne
 * TECHNIQUE. Côté recherche, le registre est lu sur autant de vraies pages que
 * le `limit` en demande (`MAX_REGISTRY_PAGES`, `apps/ia/app/routers/discover.py`).
 * Aucun débit de crédit : il n'y a pas de coût à annoncer.
 */
/**
 * Refonte Théo (23/10) — la liste se lit par PAGES : douze comptes par page (maquette `decouvrir`, note 8 :
 * « Liste plate de ~100 comptes. Douze par page »). Au bout du chargé, la même requête s'élargit comme avant.
 */
export const DISCOVER_LIST_STEP = 12

/**
 * La recherche peut-elle rendre plus que ce qu'elle a rendu ? Oui quand elle a
 * rempli sa page (`loaded >= requested` : sinon la source est épuisée) et que
 * la borne dure n'est pas atteinte.
 */
export function canRequestMore(requestedLimit: number, loaded: number, unfinished = false): boolean {
  // #4419.8 — `unfinished` : la réponse dit qu'une source n'a pas abouti (registre public, budget de temps) ;
  // une page courte n'est alors PAS une source épuisée, la suite reste chargeable.
  return (loaded >= requestedLimit || unfinished) && requestedLimit < DISCOVER_MAX_LIMIT
}

/** Le `limit` de la requête élargie — un pas de page, jamais au-delà de la borne. */
export function nextRequestLimit(requestedLimit: number): number {
  return Math.min(DISCOVER_MAX_LIMIT, requestedLimit + DISCOVER_PAGE_SIZE)
}

/** Pose le `limit` élargi sur la requête en cours (`null` = requête inchangée). */
export function applyRequestLimit(request: DiscoverRequest | null, limit: number | null): DiscoverRequest | null {
  if (!request || limit === null) return request
  return request.mode === 'registry'
    ? { mode: 'registry', query: { ...request.query, limit } }
    : { mode: 'signals', query: { ...request.query, limit } }
}

/**
 * Le bouton « Voir 10 de plus » existe-t-il ? Oui s'il reste des comptes déjà
 * chargés à révéler, ou si la recherche peut en charger d'autres. Absent
 * quand il n'y a plus rien (jamais un bouton qui n'ouvrirait rien).
 */
export function hasMoreToShow(args: {
  available: number
  shown: number
  requestedLimit: number
  loaded: number
  /** #4419.8 — `query.skillSearch.more` de la réponse. */
  unfinished?: boolean
}): boolean {
  return args.available > args.shown || canRequestMore(args.requestedLimit, args.loaded, args.unfinished)
}

/**
 * #3901 / #3866 — le compteur « N entreprises affichées » dit ce que la liste
 * MONTRE : « 24 entreprises » au-dessus de 20 cartes après « Voir 10 de plus »
 * était un chiffre chargé, pas un chiffre affichable. Le reste chargé se
 * révèle par le bouton, il ne se compte pas d'avance.
 */
export function displayedCount(available: number, shown: number): number {
  return Math.min(available, shown)
}

/**
 * #3901.p — « N entreprises affichées dont M à fort potentiel » se calculent sur la MÊME liste : celle que
 * l'écran montre (la fenêtre de `visible`). Capture prod 16/10 : « 10 entreprises affichées » à côté de
 * « dont 15 à fort potentiel » — M comptait toute la réponse chargée. M ≤ N par construction.
 */
export function headerCounts(
  visible: readonly DiscoverCandidate[],
  shown: number,
): { shown: number; highPotential: number } {
  const count = displayedCount(visible.length, shown)
  return { shown: count, highPotential: countHighPotential(visible.slice(0, count)) }
}

/** #4363.3 — taille du PREMIER LOT servi avant la fin des enrichissements de la liste complète. */
export const DISCOVER_FIRST_LOT = 5

/** Refonte Théo — le pli du filtre d'écran : sans casse ni accents (« societe » trouve « Société »). */
export function foldForFilter(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
}

/**
 * #4419 (famille #4583 / #4584) — « N entreprises affichées » et les lignes rendues sortent d'UN SEUL calcul :
 * `listed` est l'ensemble que l'écran pagine (après le filtre d'écran), `announced` en est la taille, `pageRows`
 * la page courante. Annoncer `visible.length` pendant que la liste montrait `listed` laissait « 24 » au-dessus
 * de 12 lignes — le chiffre ne mesurait pas ce qu'il nomme.
 */
export function listWindow<T extends { name: string }>(
  visible: readonly T[],
  textFilter: string,
  page: number,
): { listed: readonly T[]; announced: number; pageRows: readonly T[] } {
  const needle = foldForFilter(textFilter)
  const listed = needle ? visible.filter(candidate => foldForFilter(candidate.name).includes(needle)) : visible
  const start = (Math.max(1, page) - 1) * DISCOVER_LIST_STEP
  return { listed, announced: listed.length, pageRows: listed.slice(start, start + DISCOVER_LIST_STEP) }
}
