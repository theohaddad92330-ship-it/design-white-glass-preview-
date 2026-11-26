import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { readAgendaPreferences, type AgendaPreferences } from '@bellum/contracts'
import { memoryApi, memoryKeys } from '@/features/memory/api'
import { i18n } from '@/i18n'
import { useSession } from '@/lib/hooks/use-session'

/**
 * #2101.17 — les préférences d'agenda de CETTE personne, lues dans son sac
 * `user_preferences` (le même que `useProtectedTime`, même sac, même clé
 * `PATCH /memory/preferences`).
 *
 * `select` passe par le lecteur du contrat : un champ absent ou corrompu est
 * ABSENT du résultat, jamais une valeur devinée.
 */
export function useAgendaPreferences() {
  const { user } = useSession()
  return useQuery<Record<string, unknown>, Error, Partial<AgendaPreferences>>({
    queryKey: memoryKeys.preferences(),
    queryFn: () => memoryApi.getPreferences(),
    select: bag => readAgendaPreferences(bag),
    enabled: !!user,
  })
}

/**
 * Pose OU efface les préférences d'agenda. `value: null` = « Non réglé » :
 * la clé est RETIRÉE du sac, jamais écrite à `null` — même discipline que
 * `useSetProtectedTime`.
 */
export function useSetAgendaPreferences() {
  const qc = useQueryClient()
  return useMutation<void, Error, AgendaPreferences | null>({
    mutationKey: ['memory', 'agendaPreferences'],
    mutationFn: async value => {
      if (value === null) {
        await memoryApi.forgetLedgerEntry('preferences', 'agendaPreferences')
        return
      }
      await memoryApi.patchPreferences({ agendaPreferences: value })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: memoryKeys.all })
      toast.success(i18n.t('knowledge:memoryLedger.agendaPreferences.saved'))
    },
    onError: err =>
      toast.error(i18n.t('knowledge:memoryLedger.agendaPreferences.saveFailed'), { description: err.message }),
  })
}
