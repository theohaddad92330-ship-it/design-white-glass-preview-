import { useQuery } from '@tanstack/react-query'
import { salesforceApi, type SalesforceStatus } from '@/features/salesforce/api'
import { useSession } from '@/lib/hooks/use-session'

export const SALESFORCE_STATUS_KEY = ['salesforce-status'] as const

export function useSalesforceStatus() {
  const { user } = useSession()
  return useQuery<SalesforceStatus>({
    queryKey: [...SALESFORCE_STATUS_KEY, user?.id],
    queryFn: () => salesforceApi.status(),
    enabled: !!user,
    staleTime: 30_000,
  })
}
