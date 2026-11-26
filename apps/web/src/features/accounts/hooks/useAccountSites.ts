import { useQuery } from '@tanstack/react-query'
import type { Site, SiteFit } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/**
 * #2284.56 — les sites RETENUS d'un compte (`GET /accounts/:id/site-list`),
 * distincts des sites du REGISTRE (`raw_analysis.branches`, lus par `TabSites`
 * via `useSiteRows`). `sites.entity_id` porte la relation `site_of` vers une
 * entité (division/BU/filiale) du compte depuis le 24/08/2026 ; jusqu'ici,
 * aucun écran ne lisait cette route — le premier point d'entrée était sans
 * appelant.
 */
export function useAccountSites(accountId: string | undefined) {
  return useQuery<{ items: (Site & { fit: SiteFit })[] }>({
    queryKey: ['accounts', 'sites', accountId ?? ''],
    queryFn: () => apiFetch<{ items: (Site & { fit: SiteFit })[] }>({ path: `/accounts/${accountId}/site-list` }),
    enabled: Boolean(accountId),
    staleTime: 60_000,
  })
}
