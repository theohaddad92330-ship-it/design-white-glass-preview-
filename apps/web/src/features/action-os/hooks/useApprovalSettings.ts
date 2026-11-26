import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { ApprovalSettingsView, UpdateApprovalSettings } from '@bellum/contracts'
import { actionOsApi, actionOsKeys } from '@/features/action-os/api'
import { i18n } from '@/i18n'
import { useSession } from '@/lib/hooks/use-session'

/** #4016 L6 — l'autonomie de l'espace et ses seuils, une seule lecture partagée. */
export function useApprovalSettings() {
  const { user } = useSession()
  return useQuery<ApprovalSettingsView>({
    queryKey: actionOsKeys.approvalSettings,
    queryFn: () => actionOsApi.approvalSettings(),
    enabled: !!user,
    staleTime: 60_000,
  })
}

export function useUpdateApprovalSettings() {
  const qc = useQueryClient()
  return useMutation<ApprovalSettingsView, Error, UpdateApprovalSettings>({
    mutationKey: ['action-os', 'approval-settings', 'update'],
    mutationFn: body => actionOsApi.updateApprovalSettings(body),
    onSuccess: view => {
      qc.setQueryData(actionOsKeys.approvalSettings, view)
      toast.success(i18n.t('routines:approvalSettings.saved'))
    },
    onError: () => toast.error(i18n.t('routines:approvalSettings.saveFailed')),
  })
}
