import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { PARTNER_ON_ACCOUNTS_KEY, fetchEsnOnMyAccounts } from '@/features/partner-pipeline/api/partner-pipeline-api'

/**
 * #2151.31-.34 / #2165.51/.53/.54/.56 — DÉCISION Louis 17/09 (QCM) : les
 * quatre filtres demandés (expertise, clients observés, relation existante,
 * rang 2) n'existent QUE relatifs à la paire (compte, ESN) sur un dossier
 * précis. Un seul filtre les remplace tous : l'AGRÉGAT de l'espace — combien
 * de dossiers ont déjà vu cette ESN.
 *
 * MÊME endpoint et MÊME clé de cache que l'annuaire partenaire
 * (`/accounts/partners`, `GET /partners/on-my-accounts`, déjà exposé en
 * lecture seule) : un second lecteur du même agrégat, aucune donnée neuve,
 * aucun appel réseau supplémentaire si la page partenaires a déjà chargé
 * dans la session.
 *
 * `enabled` évite l'appel hors du mode ESN, où ce filtre n'a aucun effet
 * (`passesMinAccountsSeen`, `discover-filters.ts`).
 */
export function usePartnerCoverage(options: {
  enabled: boolean
}): UseQueryResult<Awaited<ReturnType<typeof fetchEsnOnMyAccounts>>> {
  return useQuery({
    queryKey: PARTNER_ON_ACCOUNTS_KEY,
    queryFn: fetchEsnOnMyAccounts,
    enabled: options.enabled,
    staleTime: 5 * 60_000,
  })
}
