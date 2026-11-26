import { useQuery } from '@tanstack/react-query'
import type { AccountListItem } from '@bellum/contracts'
import { accountKeys, accountsApi } from '@/features/accounts/api'
import { useSession } from '@/lib/hooks/use-session'

/** Un compte a été ANALYSÉ (ou l'est en ce moment) : il a une date d'analyse, ou un statut qui le dit. */
function isAnalysed(account: AccountListItem): boolean {
  return Boolean(account.last_analyzed_at) || account.status === 'analyzing' || account.status === 'completed'
}

/**
 * « Mes analyses » (refonte Théo R2) — l'historique d'analyses de l'espace. Aucune route neuve : c'est
 * la liste des comptes (`GET /accounts`), du plus récent au plus ancien, réduite à ceux qui ont été
 * analysés. `ownership: 'mine'` est le filtre « Moi », `'all'` la « Toute l'équipe ».
 */
export function useAnalysesHistory(ownership: 'all' | 'mine', limit: number): AccountListItem[] | undefined {
  const { user } = useSession()
  const filters = { sort: 'date_desc', ownership, limit } as const
  const query = useQuery({
    queryKey: [...accountKeys.list(user?.id), 'analyses-history', filters],
    queryFn: () => accountsApi.list(filters),
    enabled: Boolean(user),
    staleTime: 30_000,
  })
  return query.data?.data?.filter(isAnalysed)
}
