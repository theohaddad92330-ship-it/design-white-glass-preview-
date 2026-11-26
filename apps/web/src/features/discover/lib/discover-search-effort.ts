/**
 * #4305.2 — la recherche DIT son effort : combien de sources elle a interrogées, et ce qui l'a arrêtée.
 *
 * Le moteur (`apps/ia`, `_search_effort`) écrit deux faits dans `query.searchEffort`. Ni crédit (les crédits sont
 * implicites, décision du 22/10), ni fournisseur (doctrine) : un nombre et une cause. L'écran LIT et DIT ;
 * une note absente ou illisible n'affiche rien, jamais « 0 source ».
 */
type DiscoverSearchEffortStop = 'limit' | 'time' | 'exhausted'

export type DiscoverSearchEffort = {
  sourcesQueried: number
  stoppedBy?: DiscoverSearchEffortStop
}

const STOPS: readonly string[] = ['limit', 'time', 'exhausted']

export function normalizeSearchEffort(query: Record<string, unknown> | undefined): DiscoverSearchEffort | undefined {
  const raw = query?.searchEffort
  if (typeof raw !== 'object' || raw === null) return undefined
  const note = raw as Record<string, unknown>
  const count = note.sourcesQueried
  if (typeof count !== 'number' || !Number.isInteger(count) || count <= 0) return undefined
  const stoppedBy = typeof note.stoppedBy === 'string' && STOPS.includes(note.stoppedBy) ? note.stoppedBy : undefined
  return stoppedBy
    ? { sourcesQueried: count, stoppedBy: stoppedBy as DiscoverSearchEffortStop }
    : { sourcesQueried: count }
}

/**
 * #4677.4 — le temps imparti aux SIGNAUX des cartes a coupé la recherche de N entreprises (`discover-signals`,
 * `time_budget`, avec son compte). Le budget existait dans le code seul ; l'écran le NOMME. Sans compte lisible,
 * rien : jamais « 0 entreprise » (GA-18/19).
 */
export function signalsBudgetCut(
  degraded: readonly { source: string; reason: string; count?: number }[] | undefined,
): number | undefined {
  const cut = degraded?.find(
    entry => entry.source.trim().toLowerCase() === 'discover-signals' && entry.reason === 'time_budget',
  )
  return typeof cut?.count === 'number' && Number.isInteger(cut.count) && cut.count > 0 ? cut.count : undefined
}

/**
 * #4627 — l'effort ne contredit pas « Résultats partiels ». Une source TOMBÉE (`splitDegraded().faults`, la même
 * définition que le bandeau) dit que la liste est incomplète : « volume demandé atteint » / « plus rien à rendre »
 * le démentiraient. Le nombre de sources interrogées reste vrai ; la cause qui conclurait se tait. Le délai (`time`)
 * dit déjà que la liste est coupée : il reste.
 */
export function effortConsistentWithFaults(
  effort: DiscoverSearchEffort | undefined,
  faultCount: number,
): DiscoverSearchEffort | undefined {
  if (!effort || faultCount === 0 || effort.stoppedBy === 'time') return effort
  return { sourcesQueried: effort.sourcesQueried }
}

/**
 * #4706.1 — la liste a été COUPÉE à la limite après tri : le moteur écrit `query.listCut` ({shown, found,
 * isLowerBound}). Même règle que #5009.1 : « au moins M » dès que M est une borne basse. Rien de cohérent (pas de coupe,
 * M < N, N à zéro, valeur non entière) : rien n'est dit — jamais « 0 affichés », jamais un total plus petit que la liste.
 */
export type DiscoverListCut = { shown: number; found: number; isLowerBound: boolean }

export function normalizeListCut(query: Record<string, unknown> | undefined): DiscoverListCut | undefined {
  const raw = query?.listCut
  if (typeof raw !== 'object' || raw === null) return undefined
  const { shown, found, isLowerBound } = raw as Record<string, unknown>
  if (typeof shown !== 'number' || typeof found !== 'number') return undefined
  if (!Number.isInteger(shown) || !Number.isInteger(found) || shown < 1 || found <= shown) return undefined
  return { shown, found, isLowerBound: isLowerBound === true }
}
