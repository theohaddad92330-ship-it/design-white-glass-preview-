import { useQuery } from '@tanstack/react-query'
import { odooApi, type OdooStatus } from '@/features/odoo/api'
import { useSession } from '@/lib/hooks/use-session'

export const ODOO_STATUS_KEY = ['odoo-status'] as const

export function useOdooStatus() {
  const { user } = useSession()
  return useQuery<OdooStatus>({
    queryKey: [...ODOO_STATUS_KEY, user?.id],
    queryFn: () => odooApi.status(),
    enabled: !!user,
    staleTime: 30_000,
  })
}
