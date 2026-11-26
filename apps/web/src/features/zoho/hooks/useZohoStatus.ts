import { useQuery } from '@tanstack/react-query'
import { zohoApi } from '@/features/zoho/api'
import { useSession } from '@/lib/hooks/use-session'

export const ZOHO_STATUS_KEY = ['zoho-status'] as const

export function useZohoStatus() {
  const { user } = useSession()
  return useQuery({
    queryKey: [...ZOHO_STATUS_KEY, user?.id],
    queryFn: () => zohoApi.status(),
    enabled: !!user,
    staleTime: 30_000,
  })
}
