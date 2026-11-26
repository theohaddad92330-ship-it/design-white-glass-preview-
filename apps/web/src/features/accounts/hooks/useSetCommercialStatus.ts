import { COMMERCIAL_STATUSES_REQUIRING_REASON, type CommercialLifecycle } from '@bellum/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { i18n } from '@/i18n'
import { accountKeys, accountsApi } from '@/features/accounts/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * Tri commercial manuel (Théo p.39) — déplace un compte entre
 * À trier / À suivre / Opportunité / Client / Écarté. Invalide la liste + le
 * détail pour que l'onglet actif se re-filtre immédiatement.
 */
export function useSetCommercialStatus() {
  const qc = useQueryClient()
  const { user } = useSession()

  return useMutation<
    { id: string; commercial_status: CommercialLifecycle },
    Error,
    { id: string; status: CommercialLifecycle; reason?: string }
  >({
    mutationKey: ['accounts', 'commercial-status'],
    mutationFn: ({ id, status, reason }) => {
      // #2117.23 — un statut de SORTIE n'est jamais envoyé sans motif : le
      // contrat l'accepte optionnel, l'écran l'exige. La liste vit dans
      // `@bellum/contracts` (GA-26), pas ici.
      if (COMMERCIAL_STATUSES_REQUIRING_REASON.includes(status) && !reason?.trim()) {
        return Promise.reject(new Error('commercial_status_reason_required'))
      }
      return accountsApi.setCommercialStatus(id, status, reason)
    },
    onSuccess: ({ commercial_status }, { id }) => {
      qc.invalidateQueries({ queryKey: accountKeys.detail(id) })
      qc.invalidateQueries({ queryKey: accountKeys.list(user?.id) })
      // i18n keys: commercialStatus.inbox | commercialStatus.watching | commercialStatus.opportunity | commercialStatus.customer | commercialStatus.archived
      toast.success(
        i18n.t('accounts:toast.movedTo', { status: i18n.t(`accounts:commercialStatus.${commercial_status}`) }),
      )
    },
    onError: () => {
      toast.error(i18n.t('accounts:toast.statusError'))
    },
  })
}
