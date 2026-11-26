import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { UserAttackAngle } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { accountKeys, accountsApi } from '@/features/accounts/api'

/**
 * « Générer un autre angle d'attaque » (Théo TF1 p31) — mutation for
 * `POST /analysis/:id/generate-angle`.
 *
 * Re-runs the strategy phase and ACCUMULATES the freshest recommended angle into
 * the dossier's angles without overwriting the previous ones. No credit is
 * debited. On success we invalidate the account detail so the new angle appears
 * (`planViewData` reads `user_attack_angles` first) and confirm — distinguishing
 * a real add from a duplicate the server deduped. When the IA returned nothing
 * usable the endpoint 502s: we say so instead of inventing an angle.
 */
export function useGenerateAttackAngle(accountId: string) {
  const qc = useQueryClient()

  return useMutation<{ angle: UserAttackAngle; added: boolean }, Error>({
    mutationKey: ['accounts', accountId, 'generateAttackAngle'],
    mutationFn: () => accountsApi.generateAngle(accountId),
    onSuccess: ({ added }) => {
      qc.invalidateQueries({ queryKey: accountKeys.detail(accountId) })
      if (added) {
        toast.success(i18n.t('accounts:toast.angleGenerated'))
      } else {
        // Non-inventé : la stratégie a re-remonté un angle déjà au dossier — on le
        // dit plutôt que d'annoncer un faux « nouvel angle ».
        toast.info(i18n.t('accounts:toast.angleGeneratedDuplicate'))
      }
    },
    onError: err => {
      toast.error(err.message || i18n.t('accounts:toast.angleGenerateError'))
    },
  })
}
