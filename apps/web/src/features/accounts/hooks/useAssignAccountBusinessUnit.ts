import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'
import { accountKeys } from '@/features/accounts/api'

/**
 * #2128 — rattacher un compte à une BU (ou l'en détacher : `null`), par l'endpoint EXISTANT
 * `PUT /accounts/:id/business-unit` (`records:write` côté serveur : 403 à qui ne peut que lire).
 * Jamais optimiste : le serveur peut refuser (périmètre hors espace), un faux libellé serait pire qu'une attente.
 */
export function useAssignAccountBusinessUnit(accountId: string) {
  const { t } = useTranslation('accounts')
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (businessUnitId: string | null) =>
      apiFetch<{ assigned: boolean }, { businessUnitId: string | null }>({
        path: `/accounts/${encodeURIComponent(accountId)}/business-unit`,
        method: 'PUT',
        body: { businessUnitId },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: accountKeys.detail(accountId) })
      void queryClient.invalidateQueries({ queryKey: ['accounts'] })
      toast.success(t('collaboration.businessUnitSaved'))
    },
    onError: (error: Error) => {
      toast.error(t(error.cause === 403 ? 'collaboration.businessUnitForbidden' : 'collaboration.businessUnitFailed'))
    },
  })
}
