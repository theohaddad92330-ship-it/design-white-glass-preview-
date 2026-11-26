import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { i18n } from '@/i18n'
import { accountKeys, accountsApi } from '@/features/accounts/api'

export function useResearchSites(accountId: string) {
  const qc = useQueryClient()

  return useMutation<{ matched: number; total: number }, Error>({
    mutationKey: ['accounts', accountId, 'siteResearch'],
    mutationFn: () => accountsApi.researchSite(accountId),
    onSuccess: ({ total }) => {
      if (total === 0) {
        toast.info(i18n.t('accounts:toast.noSitesToEnrich'))
      } else {
        toast.success(i18n.t('accounts:toast.sitesUpdated'))
      }
      qc.invalidateQueries({ queryKey: accountKeys.detail(accountId) })
    },
    onError: err => {
      toast.error(err.message || i18n.t('accounts:toast.sitesError'))
    },
  })
}
