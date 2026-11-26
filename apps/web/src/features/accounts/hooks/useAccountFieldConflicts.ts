import { useQuery } from '@tanstack/react-query'
import type { ConflictedField } from '@bellum/contracts'
import { accountsApi } from '@/features/accounts/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * #190.1/#190.2 (épopée #3219) — les contradictions de champ d'UN dossier,
 * ouvertes ET tranchées toutes seules. Montée en permanence sur la vue
 * d'ensemble, comme `useAccountKnownMovements` : c'est ce qui dit « peut-on se
 * fier à ce chiffre », pas un détail qu'on va chercher.
 */
export function useAccountFieldConflicts(accountId: string | undefined) {
  const { user } = useSession()

  return useQuery<ConflictedField[]>({
    queryKey: ['accounts', 'field-conflicts', accountId],
    queryFn: () => accountsApi.getFieldConflicts(accountId!),
    enabled: Boolean(accountId) && !!user,
    staleTime: 5 * 60_000,
    // Une lecture secondaire : un échec ne se rejoue pas et ne fait aucune ligne.
    retry: false,
  })
}
