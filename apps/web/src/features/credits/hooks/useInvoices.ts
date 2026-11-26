import { useQuery } from '@tanstack/react-query'
import { creditsApi } from '@/features/credits/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * Real Stripe invoices for the authenticated user. Returns an empty list when
 * the user has no Stripe customer yet (honest "no invoice" state). Disabled
 * when logged out.
 */
export function useInvoices() {
  const { user } = useSession()
  return useQuery({
    queryKey: ['credits', 'invoices', user?.id] as const,
    queryFn: () => creditsApi.invoices(),
    enabled: !!user,
    staleTime: 60_000,
  })
}
