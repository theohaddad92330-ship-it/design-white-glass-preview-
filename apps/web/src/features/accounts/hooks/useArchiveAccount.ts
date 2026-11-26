import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { i18n } from '@/i18n'
import { accountKeys, accountsApi } from '@/features/accounts/api'
import { useSession } from '@/lib/hooks/use-session'

export function useArchiveAccount() {
  const qc = useQueryClient()
  const { user } = useSession()

  return useMutation<{ archived: true }, Error, string>({
    mutationKey: ['accounts', 'archive'],
    mutationFn: id => accountsApi.archive(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: accountKeys.detail(id) })
      qc.invalidateQueries({ queryKey: accountKeys.list(user?.id) })
      toast.success(i18n.t('accounts:toast.accountArchived'))
    },
    onError: () => {
      toast.error(i18n.t('accounts:toast.archiveError'))
    },
  })
}
