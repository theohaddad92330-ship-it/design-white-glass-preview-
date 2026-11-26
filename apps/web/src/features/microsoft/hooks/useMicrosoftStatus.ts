import { useQuery } from '@tanstack/react-query'
import { microsoftApi, type MicrosoftStatus } from '@/features/microsoft/api'
import { useSession } from '@/lib/hooks/use-session'

export const MICROSOFT_STATUS_KEY = ['microsoft-status'] as const

export function useMicrosoftStatus() {
  const { user } = useSession()
  return useQuery<MicrosoftStatus>({
    queryKey: [...MICROSOFT_STATUS_KEY, user?.id],
    queryFn: () => microsoftApi.status(),
    enabled: !!user,
    staleTime: 30_000,
  })
}
