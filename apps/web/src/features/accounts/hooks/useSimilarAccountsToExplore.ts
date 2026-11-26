import { useQuery } from '@tanstack/react-query'
import type { SimilarAccountSuggestion } from '@bellum/contracts'
import { accountsApi } from '@/features/accounts/api'
import { useSession } from '@/lib/hooks/use-session'
import { useDeferredEnabled } from '@/lib/hooks/use-deferred-enabled'

export function useSimilarAccountsToExplore(options: { deferred?: boolean } = {}) {
  const { user } = useSession()
  const calm = useDeferredEnabled()

  return useQuery<SimilarAccountSuggestion[]>({
    queryKey: ['accounts', 'similar-to-explore', user?.id],
    queryFn: () => accountsApi.listSimilarToExplore(),
    enabled: !!user && (!options.deferred || calm),
    staleTime: 5 * 60_000,
  })
}
