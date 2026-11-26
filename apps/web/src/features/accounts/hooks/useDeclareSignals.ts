import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { DeclareAccountSignalsRequest } from '@bellum/contracts'
import { toast } from 'sonner'
import { i18n } from '@/i18n'
import { accountKeys, accountsApi } from '@/features/accounts/api'

/**
 * #2634.1 — « Ajouter un signal depuis LinkedIn », l'appelant web qui manquait
 * à `POST /accounts/:id/signals/declare` (posé côté serveur le 22/09/2026,
 * jamais exposé). Aucun crédit, aucun appel de modèle, et surtout aucun appel
 * à LinkedIn : c'est une écriture de ce qu'un commercial a lui-même copié
 * (URL et/ou texte), même patron que `useDeclareOrgPeople`.
 */
export function useDeclareSignals(accountId: string) {
  const qc = useQueryClient()

  return useMutation<{ added: number }, Error, DeclareAccountSignalsRequest>({
    mutationKey: ['accounts', accountId, 'declareSignals'],
    mutationFn: body => accountsApi.declareSignals(accountId, body),
    onSuccess: () => {
      toast.success(i18n.t('accountWatch:declareLinkedin.toast.done'))
      qc.invalidateQueries({ queryKey: accountKeys.detail(accountId) })
    },
    onError: err => {
      toast.error(err.message || i18n.t('accountWatch:declareLinkedin.toast.error'))
    },
  })
}
