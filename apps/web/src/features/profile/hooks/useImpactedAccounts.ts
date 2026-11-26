import { useQuery } from '@tanstack/react-query'
import { esnProfileApi, esnProfileKeys } from '@/features/profile/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * #2306.24 — les comptes du portefeuille analysés avec un profil ESN plus
 * ancien que celui d'aujourd'hui, pour la notice « N comptes concernés » de
 * Réglages › Profil (`ImpactedAccountsNotice`). Même donnée que la fiche
 * compte, agrégée sur tout l'espace.
 */
export function useImpactedAccounts() {
  const { user } = useSession()
  return useQuery({
    queryKey: esnProfileKeys.impactedAccounts,
    queryFn: () => esnProfileApi.getImpactedAccounts(),
    enabled: !!user,
    staleTime: 60_000,
  })
}
