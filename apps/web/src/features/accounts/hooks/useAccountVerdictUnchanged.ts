import { useQuery } from '@tanstack/react-query'
import type { VerdictUnchanged } from '@bellum/contracts'
import { accountKeys, accountsApi } from '@/features/accounts/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * #4180 — « Même verdict depuis le … », jumelle de `useAccountVerdictRevision` (même staleTime : un run qui
 * vient de finir change les deux à la fois). `null` = le verdict a changé, est illisible, ou pas deux analyses.
 */
export function useAccountVerdictUnchanged(accountId: string | undefined) {
  const { user } = useSession()

  return useQuery<VerdictUnchanged | null>({
    queryKey: accountKeys.verdictUnchanged(accountId ?? ''),
    queryFn: () => accountsApi.getVerdictUnchanged(accountId!),
    enabled: Boolean(accountId) && !!user,
    staleTime: 60_000,
  })
}
