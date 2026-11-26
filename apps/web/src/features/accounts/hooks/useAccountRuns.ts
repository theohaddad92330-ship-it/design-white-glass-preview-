import { useQuery } from '@tanstack/react-query'
import type { AnalysisRun } from '@bellum/contracts'
import { accountKeys, accountsApi } from '@/features/accounts/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * "Historique des analyses" (Théo P0) — the append-only run log for an account,
 * newest first. Enabled only when we have an account id + a session.
 * Short staleTime so a run that just finished shows up on the next visit —
 * but #2915.3 : staleTime alone never REFETCHES a query that stays mounted,
 * it only skips a fetch that would happen anyway. `analysis-subscription.ts`
 * invalidates this same key (`accountKeys.runs`) on `analysis:done` /
 * `analysis:error`, which is what actually refreshes the panel once a run
 * (including a resume) lands — without it, a user watching the account page
 * through a resume kept seeing the pre-resume rows.
 */
export function useAccountRuns(accountId: string | undefined) {
  const { user } = useSession()

  return useQuery<AnalysisRun[]>({
    queryKey: accountKeys.runs(accountId ?? ''),
    queryFn: () => accountsApi.listRuns(accountId!),
    enabled: Boolean(accountId) && !!user,
    staleTime: 60_000,
  })
}
