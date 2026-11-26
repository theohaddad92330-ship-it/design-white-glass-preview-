import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { i18n } from '@/i18n'
import { accountKeys, accountsApi } from '@/features/accounts/api'

/**
 * Rattacher un dossier en double à celui qu'on garde (#1111).
 *
 * Rien n'est supprimé : le dossier absorbé est ARCHIVÉ et porte le nom de celui
 * auquel il a été rattaché. Le message de succès le RAPPELLE — un dossier qui
 * disparaît de la liste sans un mot se lit comme une suppression.
 */
export function useAbsorbAccount() {
  const qc = useQueryClient()

  return useMutation<
    { absorbedName: string; keptName: string; movedContacts: number },
    Error,
    { accountId: string; into: string }
  >({
    mutationKey: ['accounts', 'absorb'],
    mutationFn: ({ accountId, into }) => accountsApi.absorbAccount(accountId, into),
    onSuccess: result => {
      toast.success(
        i18n.t('accounts:absorb.toast.done', {
          absorbed: result.absorbedName,
          kept: result.keptName,
          count: result.movedContacts,
        }),
      )
      qc.invalidateQueries({ queryKey: accountKeys.all })
    },
    onError: err => {
      toast.error(err.message || i18n.t('accounts:absorb.toast.error'))
    },
  })
}
