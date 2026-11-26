import { useQuery } from '@tanstack/react-query'
import type { AccountChanges } from '@bellum/contracts'
import { accountsApi } from '@/features/accounts/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * #4180 (EX-10) — ce qui a changé sur le compte depuis la dernière vérification.
 *
 * AUCUNE reprise : un 503 est une RÉPONSE (le service n'est pas monté), pas un incident réseau — même raison que
 * `useAccountKnownMovements`.
 */
export function useAccountChanges(accountId: string | undefined) {
  const { user } = useSession()

  return useQuery<AccountChanges>({
    queryKey: ['accounts', 'changes-since-check', accountId],
    queryFn: () => accountsApi.getChangesSinceCheck(accountId!),
    enabled: Boolean(accountId) && !!user,
    staleTime: 5 * 60_000,
    retry: false,
  })
}
