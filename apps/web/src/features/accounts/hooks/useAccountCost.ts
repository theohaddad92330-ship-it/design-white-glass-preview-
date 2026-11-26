import { useQuery } from '@tanstack/react-query'
import type { AccountCostSummary } from '@bellum/contracts'
import { accountsApi } from '@/features/accounts/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * Cost transparency for an account (Drive backlog #12) — the API + run spend
 * already tracked server-side. `enabled` gates on an id + session; callers ALSO
 * gate the render on the workspace role so a non-manager never fires the query.
 */
export function useAccountCost(accountId: string | undefined, enabled = true) {
  const { user } = useSession()

  return useQuery<AccountCostSummary>({
    queryKey: ['accounts', 'cost', accountId],
    queryFn: () => accountsApi.getCost(accountId!),
    enabled: Boolean(accountId) && !!user && enabled,
    staleTime: 60_000,
  })
}
