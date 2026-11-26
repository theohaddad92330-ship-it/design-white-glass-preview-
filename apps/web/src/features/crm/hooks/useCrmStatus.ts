import { useQuery } from '@tanstack/react-query'
import { crmApi, type CrmStatus } from '@/features/crm/api'
import { useSession } from '@/lib/hooks/use-session'

export const CRM_STATUS_KEY = ['crm-status'] as const

export function useCrmStatus() {
  const { user } = useSession()
  return useQuery<CrmStatus>({
    queryKey: [...CRM_STATUS_KEY, user?.id],
    queryFn: () => crmApi.status(),
    enabled: !!user,
    staleTime: 30_000,
  })
}
