import type { QueryClient } from '@tanstack/react-query'
import type { DiscoverResponse } from './discover-types'

/**
 * #4517 — un seul chargement, puis TOUS les résultats d'un coup : ce que la recherche a déjà trouvé (le premier lot,
 * ou la liste complète avant son second passage) est TENU EN RÉSERVE, jamais affiché pendant l'attente. Seul
 * « Arrêter » (#4490.2) le rend, nommé partiel : c'est la promesse « les résultats déjà reçus restent affichés ».
 * La mémoire est celle du cache de requêtes (isolée par session / test).
 */
const heldByClient = new WeakMap<QueryClient, Map<string, DiscoverResponse>>()

export function holdFound(client: QueryClient, searchKey: string, found: DiscoverResponse): void {
  const held = heldByClient.get(client) ?? new Map<string, DiscoverResponse>()
  heldByClient.set(client, held)
  held.set(searchKey, found)
}

export function releaseFound(client: QueryClient, searchKey: string): DiscoverResponse | undefined {
  const held = heldByClient.get(client)
  const found = held?.get(searchKey)
  held?.delete(searchKey)
  return found
}
