import type { DiscoverRequest } from '@/features/discover/hooks/useDiscoverSearch'

/** La clé de cache d'une recherche — EST la requête. Partagée avec le second passage (#4305), qui écrit
 *  dans la MÊME entrée pour compléter la liste affichée. Dans son propre fichier : le crochet de recherche
 *  se moque dans les tests de l'écran, la clé ne doit pas disparaître avec lui. */
export function discoverSearchKey(request: DiscoverRequest | null) {
  return ['discover', 'v2', request?.mode ?? 'idle', request?.query ?? null] as const
}
