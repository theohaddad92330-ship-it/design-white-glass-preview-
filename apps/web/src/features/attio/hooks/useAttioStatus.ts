import { useQuery } from '@tanstack/react-query'
import { attioApi, type AttioStatus } from '@/features/attio/api'
import { useSession } from '@/lib/hooks/use-session'

export const ATTIO_STATUS_KEY = ['attio-status'] as const

export function useAttioStatus() {
  const { user } = useSession()
  return useQuery<AttioStatus>({
    queryKey: [...ATTIO_STATUS_KEY, user?.id],
    queryFn: () => attioApi.status(),
    enabled: !!user,
    staleTime: 30_000,
  })
}
