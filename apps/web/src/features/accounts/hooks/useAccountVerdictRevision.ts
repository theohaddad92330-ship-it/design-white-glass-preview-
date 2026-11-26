import { useQuery } from '@tanstack/react-query'
import type { VerdictRevision } from '@bellum/contracts'
import { accountKeys, accountsApi } from '@/features/accounts/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * #3212.4/.6 (épopée #3235) — la révision de verdict entre les deux derniers
 * runs terminés d'un compte, jumelle de `useAccountRuns` (même clé d'espace
 * de nom, même staleTime : un run qui vient de finir change les deux à la
 * fois). `null` = rien à expliquer — jamais un tiroir vide affiché comme une
 * révision passée sous silence.
 */
export function useAccountVerdictRevision(accountId: string | undefined) {
  const { user } = useSession()

  return useQuery<VerdictRevision | null>({
    queryKey: accountKeys.verdictRevision(accountId ?? ''),
    queryFn: () => accountsApi.getVerdictRevision(accountId!),
    enabled: Boolean(accountId) && !!user,
    staleTime: 60_000,
  })
}
