import { useQuery } from '@tanstack/react-query'
import type { SimilarAccountSuggestion } from '@bellum/contracts'
import { accountsApi } from '@/features/accounts/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * "Comptes similaires à CE compte" (Théo p.41) — same-sector companies found by
 * the account's NAF code. Enabled only when we have an account id + a session.
 */
/** Un seul endroit (GA-26) : la carte « comptes similaires » du dossier (#2127.37,
 *  masquer/démasquer) doit filtrer le MÊME cache que celui-ci lit. */
export function similarToAccountQueryKey(accountId: string | undefined) {
  return ['accounts', 'similar-to-account', accountId] as const
}

export function useSimilarToAccount(accountId: string | undefined) {
  const { user } = useSession()

  return useQuery<SimilarAccountSuggestion[]>({
    queryKey: similarToAccountQueryKey(accountId),
    queryFn: () => accountsApi.listSimilarToAccount(accountId!),
    enabled: Boolean(accountId) && !!user,
    staleTime: 5 * 60_000,
  })
}
