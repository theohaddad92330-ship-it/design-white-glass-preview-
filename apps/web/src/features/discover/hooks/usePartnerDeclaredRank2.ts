import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import {
  fetchPartnerProfileMatches,
  partnerProfileMatchesKey,
} from '@/features/partner-pipeline/api/partner-pipeline-api'

/**
 * #2165.56 / #2151.34 — le statut de rang 2 DÉCLARÉ (doctrine #2298.9),
 * distinct de l'observé que lit `usePartnerCoverage` juste à côté : une ESN
 * observée en rang 2 sur un dossier de l'espace n'implique pas qu'elle
 * accepte le rang 2 en général — c'est l'ESN elle-même qui le dit, via
 * `esn_directory.open_to_subcontracting` (agrégat communautaire ≥ 3 espaces,
 * D589-D593).
 *
 * MÊME endpoint et MÊME clé de cache que l'onglet Partenaires
 * (`GET /partners/profile-matches`, `PartnerPipeline.tsx`) : un second
 * lecteur, aucune donnée neuve, aucun appel réseau supplémentaire si cet
 * onglet a déjà chargé dans la session.
 *
 * `enabled` évite l'appel hors du panneau Partenaires, où ce statut n'a
 * aucun effet.
 */
export function usePartnerDeclaredRank2(options: {
  enabled: boolean
  geoZones: readonly string[]
}): UseQueryResult<Awaited<ReturnType<typeof fetchPartnerProfileMatches>>> {
  return useQuery({
    queryKey: partnerProfileMatchesKey(options.geoZones),
    queryFn: fetchPartnerProfileMatches,
    enabled: options.enabled,
    staleTime: 30 * 60_000,
  })
}
