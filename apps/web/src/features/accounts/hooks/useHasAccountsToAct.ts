import { useQuery } from '@tanstack/react-query'
import { accountsApi, accountKeys, type HasAccountsToActResponse } from '@/features/accounts/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * #2091.31 — le signal de PORTEFEUILLE EXISTANT pour la carte « prioriser la
 * semaine » de `/welcome` : un utilisateur qui vient de finir l'onboarding
 * n'a, par construction, rien à prioriser — cette lecture le distingue d'un
 * utilisateur qui a déjà des comptes en attente.
 */
export function useHasAccountsToAct() {
  const { user } = useSession()

  return useQuery<HasAccountsToActResponse>({
    queryKey: accountKeys.hasAccountsToAct(),
    queryFn: () => accountsApi.hasAccountsToAct(),
    enabled: !!user,
    staleTime: 60_000,
  })
}
