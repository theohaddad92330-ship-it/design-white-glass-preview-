import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { MESSAGE_APPROACH_PREFERENCE_KEY, readMessageApproachPreference } from '@bellum/contracts'
import { memoryApi, memoryKeys } from '@/features/memory/api'
import { i18n } from '@/i18n'
import { useSession } from '@/lib/hooks/use-session'

/**
 * #4060 — la préférence « approche directe » de CETTE personne, lue dans son sac `user_preferences`
 * (le même que `useReplyPreferences`). Le lecteur du contrat rend `null` pour une clé absente ou inconnue :
 * l'écran montre « Par défaut » exactement quand le service de messages n'applique rien.
 */
export function useMessageApproach() {
  const { user } = useSession()
  return useQuery<Record<string, unknown>, Error, 'direct' | null>({
    queryKey: memoryKeys.preferences(),
    queryFn: () => memoryApi.getPreferences(),
    select: bag => readMessageApproachPreference(bag),
    enabled: !!user,
  })
}

/**
 * Pose OU retire la préférence. `null` = « Par défaut » : la clé est RETIRÉE du sac, jamais écrite à `null`
 * (même discipline que `useSetReplyPreference`). Réversible à tout moment.
 */
export function useSetMessageApproach() {
  const qc = useQueryClient()
  return useMutation<void, Error, 'direct' | null>({
    mutationKey: ['memory', 'messageApproach'],
    mutationFn: async value => {
      if (value === null) {
        await memoryApi.forgetLedgerEntry('preferences', MESSAGE_APPROACH_PREFERENCE_KEY)
        return
      }
      await memoryApi.patchPreferences({ [MESSAGE_APPROACH_PREFERENCE_KEY]: value })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: memoryKeys.all })
      toast.success(i18n.t('knowledge:memoryLedger.messageApproach.saved'))
    },
    onError: err =>
      toast.error(i18n.t('knowledge:memoryLedger.messageApproach.saveFailed'), { description: err.message }),
  })
}
