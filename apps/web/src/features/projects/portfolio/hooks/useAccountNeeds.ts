import { useQuery } from '@tanstack/react-query'
import type { AccountNeedsRow } from '@bellum/contracts'
import { accountsApi, accountKeys } from '@/features/accounts/api'
import { useSession } from '@/lib/hooks/use-session'

/** Besoins du portefeuille (`GET /accounts/needs`) — lecture pure de l'analyse
 *  déjà stockée, mêmes réglages de cache que le flux Veille. */
export function useAccountNeeds() {
  const { user } = useSession()

  return useQuery<AccountNeedsRow[]>({
    queryKey: accountKeys.needs(user?.id),
    queryFn: accountsApi.listNeeds,
    enabled: !!user,
    staleTime: 30_000,
  })
}
