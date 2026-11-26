import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { accountsApi } from '@/features/accounts/api'

/**
 * #2128.13 (épopée #2788) — « Permettre de demander validation manager » sur
 * un compte. Pose une tâche sur chaque membre habilité (`team:manage`) — voir
 * `TasksService.requestManagerValidation`. Une liste VIDE en retour n'est pas
 * un échec : c'est un espace où personne d'autre n'est habilité.
 */
export function useRequestManagerValidation(accountId: string) {
  const { t } = useTranslation('accounts')
  return useMutation({
    mutationFn: (note?: string) => accountsApi.requestManagerValidation(accountId, note),
    onSuccess: response => {
      toast[response.items.length > 0 ? 'success' : 'info'](
        response.items.length > 0
          ? t('collaboration.requestValidation.sent', { count: response.items.length })
          : t('collaboration.requestValidation.noManager'),
      )
    },
    onError: () => toast.error(t('collaboration.requestValidation.failed')),
  })
}
