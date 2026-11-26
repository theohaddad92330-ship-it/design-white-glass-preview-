import { useQuery } from '@tanstack/react-query'
import { creditsApi } from '@/features/credits/api'

/**
 * The live, operator-editable plan catalog (`GET /credits/plans`).
 *
 * Without it the billing screen renders its shipped baseline, which goes stale
 * the moment an operator edits a price in the backoffice — the screen would
 * quote one amount while Stripe charges another. Public endpoint, so it loads
 * logged out too (the pricing cards are shown before checkout).
 *
 * Rarely changes; cached generously. Consumers must degrade to the baseline
 * rather than block on it — see `getPlans()`.
 */
export function usePlans() {
  return useQuery({
    queryKey: ['credits', 'plans'] as const,
    queryFn: () => creditsApi.plans(),
    staleTime: 5 * 60_000,
  })
}
