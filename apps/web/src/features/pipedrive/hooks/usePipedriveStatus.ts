import { useQuery } from '@tanstack/react-query'
import { pipedriveApi, type PipedriveStatus } from '@/features/pipedrive/api'
import { useSession } from '@/lib/hooks/use-session'

export const PIPEDRIVE_STATUS_KEY = ['pipedrive-status'] as const

export function usePipedriveStatus() {
  const { user } = useSession()
  return useQuery<PipedriveStatus>({
    queryKey: [...PIPEDRIVE_STATUS_KEY, user?.id],
    queryFn: () => pipedriveApi.status(),
    enabled: !!user,
    staleTime: 30_000,
  })
}
