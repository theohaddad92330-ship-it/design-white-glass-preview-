import { useQuery } from '@tanstack/react-query'
import type { OpenNeedsQuery } from '@bellum/contracts'
import { openNeedsApi, openNeedsKeys } from '../api'

/**
 * La liste transverse des besoins ouverts. Paginée côté SERVEUR : cinq cents
 * besoins n'ont pas à traverser le réseau pour qu'on en affiche cinquante.
 *
 * #2319.7 — `enabled` (même forme que `useMissions`, `missions/api.ts`) :
 * un appelant qui filtre par `account_id` d'un compte pas encore RATTACHÉ ne
 * doit pas interroger la vue transverse en attendant — ce serait lire les
 * besoins de tout l'espace pour n'en garder aucun.
 */
export function useOpenNeeds(query: OpenNeedsQuery, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: openNeedsKeys.list(query),
    queryFn: () => openNeedsApi.list(query),
    enabled: options.enabled ?? true,
    // La liste garde l'affichage précédent pendant qu'un filtre se recharge :
    // un tableau qui clignote à chaque frappe se lit comme une panne.
    placeholderData: previous => previous,
  })
}

/**
 * #2842 (reste, 26/09) — `clientNeeds`/`needDetailing` de l'audit commercial
 * (`useCommercialAudit.ts`). Non lu (chargement, erreur) ⇒ `data` reste
 * `undefined`, jamais un compte deviné (même discipline que `useTalentStats`).
 */
export function useOpenNeedsCommercialAuditSignals() {
  return useQuery({
    queryKey: openNeedsKeys.commercialAuditSignals,
    queryFn: () => openNeedsApi.commercialAuditSignals(),
    staleTime: 30_000,
  })
}
