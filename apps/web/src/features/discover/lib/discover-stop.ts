import type { QueryClient } from '@tanstack/react-query'
import type { DiscoverRequest } from '@/features/discover/hooks/useDiscoverSearch'
import { discoverSearchKey } from '@/features/discover/lib/discover-search-key'
import { releaseFound } from './discover-held-lot'
import type { DiscoverResponse } from './discover-types'

/**
 * #4490.2 — « Arrêter » : coupe la requête en cours via son `AbortSignal` (celui de la requête de cache,
 * déjà transmis à `discover-api.ts`). `revert: false` GARDE ce qui est déjà arrivé (le lot tenu en
 * réserve, #4517) : les résultats reçus restent à l'écran, l'écran les nomme « recherche arrêtée ».
 */
export async function stopDiscoverSearch(client: QueryClient, request: DiscoverRequest | null): Promise<void> {
  const queryKey = discoverSearchKey(request)
  await client.cancelQueries({ queryKey, exact: true }, { revert: false })
  // #4517 — ce que la recherche avait déjà trouvé était tenu en réserve : il sort maintenant, nommé partiel.
  const found = releaseFound(client, JSON.stringify(queryKey))
  if (found && !client.getQueryData(queryKey)) client.setQueryData<DiscoverResponse>(queryKey, found)
}

/** #4490.2 — relancer une recherche arrêtée repart de zéro : l'entrée coupée (et son premier lot) est oubliée,
 *  sinon la clé identique ne rappellerait jamais les sources. */
export function forgetStoppedSearch(client: QueryClient, request: DiscoverRequest | null): void {
  const queryKey = discoverSearchKey(request)
  releaseFound(client, JSON.stringify(queryKey))
  client.removeQueries({ queryKey, exact: true })
}
