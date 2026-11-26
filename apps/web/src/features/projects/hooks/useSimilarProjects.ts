import { useQuery } from '@tanstack/react-query'
import type { ProjectSimilarResponse } from '@bellum/contracts'
import { projectsApi, projectQueryKeys } from '../api'

/**
 * « Ce besoin ailleurs » (`GET /opportunities/:id/similar`, restitution V2 §7) —
 * the same need found on the workspace's OTHER accounts. Fetched only while the
 * comparison panel is open (`enabled`), and cached briefly: the answer moves at
 * the pace of analyses, not of clicks.
 */
export function useSimilarProjects(opportunityId: string | undefined, enabled: boolean) {
  return useQuery<ProjectSimilarResponse>({
    queryKey: projectQueryKeys.similar(opportunityId ?? ''),
    queryFn: () => projectsApi.similar(opportunityId as string),
    enabled: enabled && !!opportunityId,
    staleTime: 60_000,
  })
}
