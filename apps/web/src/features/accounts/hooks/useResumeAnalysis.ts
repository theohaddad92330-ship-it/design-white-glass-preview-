import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { i18n } from '@/i18n'
import { accountKeys, accountsApi } from '@/features/accounts/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * Mutation for ``POST /analysis/:accountId/resume``. Re-enqueues the BullMQ
 * job for an account stuck in ``status = 'error'`` and lets the worker pick
 * up from the last successful phase via ``analysis.phase_completed`` events
 * in the outbox.
 *
 * Invalidates both the detail (so the banner switches off and the progress
 * card mounts) and the list (so the row's status chip flips to
 * "analyzing"). Errors surface via toast.
 */
export function useResumeAnalysis() {
  const qc = useQueryClient()
  const { user } = useSession()

  return useMutation<{ jobId: string; accountId: string }, Error, string>({
    mutationKey: ['accounts', 'resumeAnalysis'],
    mutationFn: accountId => accountsApi.resumeAnalysis(accountId),
    onSuccess: ({ accountId }) => {
      qc.invalidateQueries({ queryKey: accountKeys.detail(accountId) })
      qc.invalidateQueries({ queryKey: accountKeys.list(user?.id) })
      toast.success(i18n.t('accounts:toast.analysisResumed'))
    },
    onError: err => {
      toast.error(err instanceof Error ? err.message : i18n.t('accounts:toast.resumeError'))
    },
  })
}
