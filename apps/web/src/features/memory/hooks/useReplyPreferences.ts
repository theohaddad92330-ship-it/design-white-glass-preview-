import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { readReplyPreferences, type ReplyPreferenceKey, type ReplyPreferences } from '@bellum/contracts'
import { memoryApi, memoryKeys } from '@/features/memory/api'
import { i18n } from '@/i18n'
import { useSession } from '@/lib/hooks/use-session'

/**
 * #1928.9 — les réglages de réponse de CETTE personne, lus dans son sac
 * `user_preferences` (le même que Laura relit à chaque tour).
 *
 * `select` passe par le lecteur du contrat : une valeur inconnue y est ABSENTE,
 * donc l'écran montre « Par défaut » exactement quand le prompt ne reçoit
 * aucune consigne — jamais un réglage affiché que Laura ne lirait pas.
 */
export function useReplyPreferences() {
  const { user } = useSession()
  return useQuery<Record<string, unknown>, Error, ReplyPreferences>({
    queryKey: memoryKeys.preferences(),
    queryFn: () => memoryApi.getPreferences(),
    select: bag => readReplyPreferences(bag),
    enabled: !!user,
  })
}

/**
 * Pose OU efface un réglage. `value: null` = « Par défaut » : la clé est RETIRÉE
 * du sac (`DELETE /memory/ledger/preferences/:clé`), jamais écrite à `null` —
 * une clé laissée à `null` resterait une ligne du registre sans rien dire.
 *
 * Invalide TOUTE la mémoire : le registre de la même page lit le même sac.
 */
export function useSetReplyPreference() {
  const qc = useQueryClient()
  return useMutation<void, Error, { key: ReplyPreferenceKey; value: string | null }>({
    mutationKey: ['memory', 'replyPreference'],
    mutationFn: async ({ key, value }) => {
      if (value === null) {
        await memoryApi.forgetLedgerEntry('preferences', key)
        return
      }
      await memoryApi.patchPreferences({ [key]: value })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: memoryKeys.all })
      toast.success(i18n.t('knowledge:memoryLedger.reply.saved'))
    },
    onError: err => toast.error(i18n.t('knowledge:memoryLedger.reply.saveFailed'), { description: err.message }),
  })
}
