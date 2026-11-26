import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { i18n } from '@/i18n'
import { accountKeys, accountsApi } from '@/features/accounts/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * #2165.13 — les comptes marqués « meilleure référence » sur cet espace, la
 * SOURCE du preset Découvrir « Proches de mes meilleures références ».
 */
export function useBestReferences() {
  const { user } = useSession()
  return useQuery({
    queryKey: accountKeys.bestReferences(),
    queryFn: () => accountsApi.fetchBestReferences(),
    enabled: !!user,
    staleTime: 60_000,
  })
}

/**
 * Marquer/démarquer CE compte comme la meilleure référence. Geste HUMAIN
 * auto-approuvé (le clic EST la décision) : aucune porte à ouvrir pour un
 * simple marqueur.
 */
export function useSetBestReference() {
  const qc = useQueryClient()

  return useMutation<{ id: string; is_best_reference: boolean }, Error, { id: string; value: boolean }>({
    mutationKey: ['accounts', 'best-reference'],
    mutationFn: ({ id, value }) => accountsApi.setBestReference(id, value),
    onSuccess: ({ is_best_reference }, { id }) => {
      qc.invalidateQueries({ queryKey: accountKeys.detail(id) })
      qc.invalidateQueries({ queryKey: accountKeys.bestReferences() })
      toast.success(
        is_best_reference
          ? i18n.t('accounts:bestReference.markedToast')
          : i18n.t('accounts:bestReference.unmarkedToast'),
      )
    },
    // La phrase de l'API vient de `error.message` (Nest range sa raison là,
    // jamais dans `error`) — même patron que les trois gestes administratifs
    // de `useAccountAdminActions.ts`.
    onError: error => {
      toast.error(i18n.t('accounts:bestReference.errorToast'), { description: error.message })
    },
  })
}
