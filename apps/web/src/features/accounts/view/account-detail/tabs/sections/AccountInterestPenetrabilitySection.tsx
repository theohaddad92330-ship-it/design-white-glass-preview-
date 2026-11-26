import { useAccountInterestPenetrability } from '@/features/accounts/hooks/useAccountInterestPenetrability'
import { AccountInterestPenetrabilityCard } from './AccountInterestPenetrabilityCard'

/**
 * BEL-SC-229 (#3258, P0) — L'APPELANT de `GET /accounts/:id/interest-penetrability`.
 *
 * Même motif que `AccountStrategy5PSection` (#3254) : le hook réseau vit dans
 * ce composant dédié, jamais dans `TabOverview` directement, pour que les
 * tests qui montent `TabOverview` sans `SessionProvider` continuent de
 * passer. La carte reste PURE (elle reçoit `matrix`).
 */
export function AccountInterestPenetrabilitySection({ accountId }: { accountId: string }) {
  const matrix = useAccountInterestPenetrability(accountId).data ?? null
  return <AccountInterestPenetrabilityCard matrix={matrix} />
}
