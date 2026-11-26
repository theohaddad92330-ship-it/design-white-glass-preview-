import { useNavigate } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { i18n } from '@/i18n'
import { accountKeys, accountsApi } from '@/features/accounts/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * Théo A comptes-fiche-reference.A2 — « Créer une copie de travail » d'un dossier de
 * référence. La copie hérite des notes, l'archive reste intacte ; on atterrit sur la
 * copie. Idempotent côté API : une copie déjà ouverte est rouverte, jamais dupliquée.
 */
export function useCreateWorkingCopy(archiveId: string) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { user } = useSession()

  return useMutation<{ id: string; created: boolean }, Error, void>({
    mutationKey: ['accounts', archiveId, 'workingCopy'],
    mutationFn: () => accountsApi.createWorkingCopy(archiveId),
    onSuccess: ({ id, created }) => {
      qc.invalidateQueries({ queryKey: accountKeys.list(user?.id) })
      toast.success(
        i18n.t(created ? 'accounts:referenceArchive.toast.created' : 'accounts:referenceArchive.toast.existing'),
      )
      void navigate({ to: '/accounts/$id', params: { id } })
    },
    onError: () => {
      toast.error(i18n.t('accounts:referenceArchive.toast.error'))
    },
  })
}
