import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { DEFAULT_MANAGER_PERIOD_DAYS, type ManagerPeriodDays } from '@bellum/contracts'
import { useSession } from '@/lib/hooks/use-session'
import { managerApi } from '../api'

/**
 * Manager / Head-of-Sales team stats. Enabled only when signed in; the backend
 * enforces the owner/admin gate (the page also gates on the workspace role so
 * members never fire this query).
 */
export function useManagerStats(periodDays: ManagerPeriodDays = DEFAULT_MANAGER_PERIOD_DAYS, enabled = true) {
  const { user } = useSession()
  return useQuery({
    // #4158.37 — la période est dans la clé : changer de période relit, et
    // `keepPreviousData` garde l'écran en place pendant la relecture.
    queryKey: ['manager', 'team-stats', user?.id, periodDays],
    queryFn: () => managerApi.teamStats(periodDays),
    enabled: !!user && enabled,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  })
}
