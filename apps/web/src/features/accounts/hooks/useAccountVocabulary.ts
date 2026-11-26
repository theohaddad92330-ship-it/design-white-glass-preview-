import { useQuery } from '@tanstack/react-query'
import type { AnalysisVocabularyTerm } from '@bellum/contracts'
import { accountsApi } from '@/features/accounts/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * « Vocabulaire du groupe » (Théo P1 p.17/21) — the account's reading grid,
 * persisted by the analysis into `account_vocabulary` and served by
 * `GET /analysis/:accountId/vocabulary`. Enabled only with an account id + a
 * session; a dossier without a stored grid resolves to `[]` (section hidden).
 */
export function useAccountVocabulary(accountId: string | undefined) {
  const { user } = useSession()

  return useQuery<AnalysisVocabularyTerm[]>({
    queryKey: ['accounts', 'vocabulary', accountId],
    queryFn: () => accountsApi.listVocabulary(accountId!),
    enabled: Boolean(accountId) && !!user,
    staleTime: 60_000,
  })
}
