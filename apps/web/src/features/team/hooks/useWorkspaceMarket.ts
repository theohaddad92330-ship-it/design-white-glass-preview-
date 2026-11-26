import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { WorkspaceMarket, WorkspaceMarketResolution } from '@bellum/contracts'
import { useSession } from '@/lib/hooks/use-session'
import { teamApi } from '../api'
import { getMarketSectionLabels } from '../market-labels'

/** react-query cache key for the active workspace's resolved market. */
const MARKET_KEY = ['workspace-market'] as const

/**
 * The active workspace's target market (country) plus the mutation to change it.
 * Reads via `GET /workspaces/market`; the owner/admin-only change persists via
 * `PATCH /workspaces/market` and seeds the cache with the freshly-resolved view
 * (locale / legal basis / country pack) the API returns — no extra round-trip.
 */
export function useWorkspaceMarket() {
  const { user } = useSession()
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: MARKET_KEY,
    queryFn: () => teamApi.getMarket(),
    enabled: !!user,
    staleTime: 60_000,
  })

  const setMarket = useMutation<WorkspaceMarketResolution, Error, WorkspaceMarket>({
    mutationFn: market => teamApi.setMarket(market),
    onSuccess: resolution => {
      qc.setQueryData<WorkspaceMarketResolution>(MARKET_KEY, resolution)
      toast.success(getMarketSectionLabels().saved)
    },
    onError: error => toast.error(error.message || getMarketSectionLabels().error),
  })

  return { market: query.data, isLoading: query.isLoading, setMarket }
}
