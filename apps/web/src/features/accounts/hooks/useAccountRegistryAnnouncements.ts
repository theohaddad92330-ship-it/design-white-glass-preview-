import { useQuery } from '@tanstack/react-query'
import type { AccountRegistryAnnouncements } from '@bellum/contracts'
import { accountsApi } from '@/features/accounts/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * #3916.b — les annonces de registre public lues EN CONTINU pour le compte
 * (la veille les relit chaque matin). Gardées dix minutes : le registre bouge
 * une fois par jour, pas à chaque ouverture de fiche. Aucune reprise : une
 * lecture en échec laisse la carte aux annonces figées par l'analyse.
 */
export function useAccountRegistryAnnouncements(accountId: string | undefined) {
  const { user } = useSession()
  return useQuery<AccountRegistryAnnouncements>({
    queryKey: ['accounts', 'registry-announcements', accountId],
    queryFn: () => accountsApi.getRegistryAnnouncements(accountId!),
    enabled: Boolean(accountId) && !!user,
    staleTime: 10 * 60_000,
    retry: false,
  })
}
