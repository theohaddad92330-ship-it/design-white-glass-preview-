import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { i18n } from '@/i18n'
import { accountKeys, accountsApi, type DetachPreview } from '@/features/accounts/api'

/**
 * Détacher un dossier de celui auquel il avait été rattaché (#1111).
 *
 * C'est ce qui rend le rattachement RÉVERSIBLE. Le dossier retrouve le statut
 * qu'il avait — celui qui avait été ENREGISTRÉ au moment du geste, jamais un
 * statut choisi — et ses contacts reviennent.
 *
 * Le message de succès dit combien de contacts sont revenus : un dossier qui
 * réapparaît dans la liste sans un mot laisse croire qu'il est revenu vide.
 */
export function useDetachAccount() {
  const qc = useQueryClient()

  return useMutation<DetachPreview, Error, { accountId: string }>({
    mutationKey: ['accounts', 'detach'],
    mutationFn: ({ accountId }) => accountsApi.detachAccount(accountId),
    onSuccess: result => {
      toast.success(
        i18n.t('accounts:detach.toast.done', {
          detached: result.detachedName,
          kept: result.keptName,
          count: result.returnedContacts,
        }),
      )
      qc.invalidateQueries({ queryKey: accountKeys.all })
    },
    onError: err => {
      toast.error(err.message || i18n.t('accounts:detach.toast.error'))
    },
  })
}
