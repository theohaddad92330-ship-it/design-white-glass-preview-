import { useQuery } from '@tanstack/react-query'
import { useSession } from '@/lib/hooks/use-session'
import { actionOsApi, actionOsKeys } from '../api'

/**
 * #2871 (#2395.1/.5) — le plan d'un compte, lu au contrat canonique
 * (`GET /accounts/:id/actions`). Lecture seule : les gestes restent dans la
 * maison native de chaque action (`usePlanItems` pour une ligne du plan).
 *
 * Désactivée hors session, comme `usePlanItems` : la fiche garde alors son
 * rendu, sans identité canonique devinée.
 */
export function useAccountCanonicalActions(accountId: string) {
  const { user } = useSession()
  return useQuery({
    queryKey: actionOsKeys.accountActions(accountId),
    queryFn: () => actionOsApi.accountActions(accountId),
    enabled: Boolean(user) && Boolean(accountId),
    staleTime: 30_000,
  })
}
