import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { readProtectedTime, type ProtectedTime } from '@bellum/contracts'
import { memoryApi, memoryKeys } from '@/features/memory/api'
import { i18n } from '@/i18n'
import { useSession } from '@/lib/hooks/use-session'

/**
 * #2101.13 — le temps protégé de CETTE personne, lu dans son sac
 * `user_preferences` (le même que `useReplyPreferences`, même sac, même clé
 * `PATCH /memory/preferences`).
 *
 * `select` passe par le lecteur du contrat : une valeur absente ou corrompue
 * rend `null`, jamais une fenêtre devinée.
 */
export function useProtectedTime() {
  const { user } = useSession()
  return useQuery<Record<string, unknown>, Error, ProtectedTime | null>({
    queryKey: memoryKeys.preferences(),
    queryFn: () => memoryApi.getPreferences(),
    select: bag => readProtectedTime(bag),
    enabled: !!user,
  })
}

/**
 * Pose OU efface le temps protégé. `value: null` = « Non réglé » : la clé est
 * RETIRÉE du sac, jamais écrite à `null` — même discipline que
 * `useSetReplyPreference`.
 */
export function useSetProtectedTime() {
  const qc = useQueryClient()
  return useMutation<void, Error, ProtectedTime | null>({
    mutationKey: ['memory', 'protectedTime'],
    mutationFn: async value => {
      if (value === null) {
        await memoryApi.forgetLedgerEntry('preferences', 'protectedTime')
        return
      }
      await memoryApi.patchPreferences({ protectedTime: value })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: memoryKeys.all })
      toast.success(i18n.t('knowledge:memoryLedger.protectedTime.saved'))
    },
    onError: err =>
      toast.error(i18n.t('knowledge:memoryLedger.protectedTime.saveFailed'), { description: err.message }),
  })
}
