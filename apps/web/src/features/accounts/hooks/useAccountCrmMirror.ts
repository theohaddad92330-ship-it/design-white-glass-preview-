import { useQuery } from '@tanstack/react-query'
import type { CrmMirrorAccountView } from '@bellum/contracts'
import { accountsApi } from '@/features/accounts/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * SYNC-A — les affaires et activités du compte copiées depuis le CRM branché (le miroir CRM).
 * Une lecture en échec (droit `crm:read` absent, réseau) ne rend RIEN : la section se tait plutôt que
 * d'afficher une liste vide qui se lirait « aucune affaire ».
 */
export function useAccountCrmMirror(accountId: string | undefined): CrmMirrorAccountView | null {
  const { user } = useSession()
  const { data } = useQuery({
    queryKey: ['accounts', 'crm-mirror', accountId],
    queryFn: () => accountsApi.getCrmMirror(accountId!),
    enabled: Boolean(accountId) && !!user,
    staleTime: 5 * 60_000,
    retry: false,
  })
  return data ?? null
}
