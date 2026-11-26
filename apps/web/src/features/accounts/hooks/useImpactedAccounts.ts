import { useQuery } from '@tanstack/react-query'
import { accountsApi, accountKeys, type ImpactedAccountsResponse } from '@/features/accounts/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * #2306.24 — « et si je change mes secteurs/offres, quels comptes sont
 * impactés ? » Même prédicat que `useProfileProvenance` (une fiche à la
 * fois), agrégé sur le portefeuille entier par le serveur — jamais un
 * second calcul côté écran.
 */
export function useImpactedAccounts() {
  const { user } = useSession()

  return useQuery<ImpactedAccountsResponse>({
    queryKey: accountKeys.impactedByProfileChange(),
    queryFn: () => accountsApi.impactedByProfileChange(),
    enabled: !!user,
    staleTime: 10 * 60_000,
  })
}
