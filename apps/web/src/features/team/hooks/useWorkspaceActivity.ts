import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { WorkspaceActivityQuery } from '@bellum/contracts'
import { useSession } from '@/lib/hooks/use-session'
import { teamApi } from '../api'

/**
 * Paginated « Journal d'activité » of the active workspace (Théo p.21 P2).
 * Server-gated by `team:manage` (owner | admin | sales_ops) — pass `enabled`
 * mirroring that permission so a member/viewer never even fires the 403.
 * `keepPreviousData` keeps the current page on screen while the next loads.
 */
export function useWorkspaceActivity(query: WorkspaceActivityQuery, enabled: boolean) {
  const { user } = useSession()
  return useQuery({
    queryKey: ['workspace-activity', query] as const,
    queryFn: () => teamApi.getActivity(query),
    enabled: !!user && enabled,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  })
}
