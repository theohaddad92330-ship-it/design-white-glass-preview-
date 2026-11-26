import { discoverStorageKey, readJson, writeJson } from './discover-storage'

/* ------------------------------------------------------------------ */
/*  #4312 — la DERNIÈRE recherche de Découvrir, pour la retrouver au    */
/*  retour d'un autre écran (Laura, une fiche…).                        */
/*                                                                     */
/*  Ce qu'on garde, c'est la forme que l'URL porte déjà (critères +     */
/*  type de résultat + mode de contexte) : l'écran sait relire cette    */
/*  forme (`restoredFiltersFromSearch`) et la relancer, la liste        */
/*  revenant du cache de requêtes. Aucune donnée de résultat ici.       */
/*  Local à l'utilisateur, sous le préfixe Découvrir (la purge RGPD le  */
/*  balaie), 24 h : un retour de Laura, pas un historique (#4313.1).    */
/* ------------------------------------------------------------------ */

const NAMESPACE = 'last-search'
export const LAST_SEARCH_TTL_MS = 24 * 60 * 60 * 1000

type LastSearch = Readonly<Record<string, string>>

interface Stored {
  at: number
  search: Record<string, string>
}

function isStored(value: unknown): value is Stored {
  if (typeof value !== 'object' || value === null) return false
  const { at, search } = value as Partial<Stored>
  return (
    typeof at === 'number' &&
    typeof search === 'object' &&
    search !== null &&
    Object.values(search).every(entry => typeof entry === 'string')
  )
}

/** Les paramètres d'URL qui portent une valeur — `undefined` et vide ne portent rien. */
function carried(search: Record<string, unknown>): Record<string, string> {
  const kept: Record<string, string> = {}
  for (const [key, value] of Object.entries(search)) {
    if (value === undefined || value === null || value === '') continue
    kept[key] = String(value)
  }
  return kept
}

/** `/discover` sans aucun paramètre : l'arrivée par le menu, pas par un lien qui précise sa demande. */
export function isBareDiscoverUrl(search: Record<string, unknown>): boolean {
  return Object.keys(carried(search)).length === 0
}

export function rememberLastSearch(userId: string | undefined, search: Record<string, unknown>, now: number): void {
  if (!userId) return
  const kept = carried(search)
  if (Object.keys(kept).length === 0) return
  writeJson(discoverStorageKey(NAMESPACE, userId), { at: now, search: kept } satisfies Stored)
}

export function readLastSearch(userId: string | undefined, now: number): LastSearch | null {
  if (!userId) return null
  const stored = readJson(discoverStorageKey(NAMESPACE, userId), isStored)
  if (!stored || now - stored.at > LAST_SEARCH_TTL_MS) return null
  return Object.keys(stored.search).length > 0 ? stored.search : null
}

export function forgetLastSearch(userId: string | undefined): void {
  if (!userId) return
  try {
    localStorage.removeItem(discoverStorageKey(NAMESPACE, userId))
  } catch {
    /* storage indisponible — rien à oublier */
  }
}
