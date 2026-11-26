import { useQuery } from '@tanstack/react-query'
import type { CoverageGapsResponse } from '@bellum/contracts'
import { accountsApi, accountKeys } from '@/features/accounts/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * « Zones blanches » (Drive backlog #5) — la carte de couverture décisionnelle du
 * compte (familles & niveaux engagés vs. angles morts à ouvrir). Enabled only when
 * we have an account id + a session. Short staleTime so a freshly-enriched contact
 * shifts the coverage map on the next visit.
 */
export function useCoverageGaps(accountId: string | undefined) {
  const { user } = useSession()

  return useQuery<CoverageGapsResponse>({
    queryKey: accountKeys.coverageGaps(accountId),
    queryFn: () => accountsApi.coverageGaps(accountId!),
    enabled: Boolean(accountId) && !!user,
    staleTime: 60_000,
  })
}
