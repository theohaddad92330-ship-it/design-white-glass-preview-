import { useQuery } from '@tanstack/react-query'
import { contactsApi } from '@/features/contacts/api'

/**
 * #2120.57 / #2297.23 — la durée d'un enrichissement se MESURE et s'annonce.
 *
 * `enabled` seulement à l'ouverture du dialogue (`EnrichConfirmDialog`) : pas
 * d'appel tant que personne n'a demandé à enrichir. `staleTime` généreux —
 * c'est une médiane produit, elle ne bouge pas d'une minute à l'autre.
 */
export function useEnrichmentDurationEstimate(enabled: boolean) {
  return useQuery({
    queryKey: ['contacts', 'enrichment-duration-estimate'],
    queryFn: () => contactsApi.enrichmentDurationEstimate(),
    enabled,
    staleTime: 5 * 60_000,
  })
}
