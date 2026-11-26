import type { ActionHistoryQuery } from '@bellum/contracts'
import { useQuery } from '@tanstack/react-query'
import { actionHistoryApi, actionHistoryKeys } from '@/features/action-history/api'
import { useSession } from '@/lib/hooks/use-session'

export function useActionHistory(filters: ActionHistoryQuery, options: { enabled?: boolean } = {}) {
  const { user } = useSession()
  return useQuery({
    queryKey: actionHistoryKeys.list(filters),
    queryFn: () => actionHistoryApi.list(filters),
    // The caller can suppress the fetch (e.g. the "since last visit" mode on a
    // first-ever visit, where there is no window to query).
    enabled: Boolean(user) && (options.enabled ?? true),
    staleTime: 60_000,
  })
}

/**
 * Poses the "depuis votre dernière connexion" reference ONCE per Journal mount
 * and returns the previous-visit instant. `staleTime: Infinity` keeps the
 * reference stable for the whole session — a re-render never re-advances it, so
 * the delta window doesn't move under the user's feet while they read it.
 */
export function useLastSeen() {
  const { user } = useSession()
  return useQuery({
    queryKey: actionHistoryKeys.lastSeen,
    queryFn: () => actionHistoryApi.markSeen(),
    enabled: Boolean(user),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  })
}

export function useActionHistoryItem(id: string) {
  const { user } = useSession()
  return useQuery({
    queryKey: actionHistoryKeys.detail(id),
    queryFn: () => actionHistoryApi.getOne(id),
    enabled: Boolean(user && id),
    staleTime: 60_000,
  })
}
