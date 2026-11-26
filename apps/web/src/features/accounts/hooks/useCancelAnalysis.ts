import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { i18n } from '@/i18n'
import { accountKeys, accountsApi } from '@/features/accounts/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * Mutation for ``POST /analysis/:accountId/cancel``. Stops the worker on the
 * backend (abort signal + revoke progress secret + remove BullMQ job) and
 * flips the account row to a "cancelled" state. Invalidates both the detail
 * cache (so the banner switches off) and the list cache (so the row's status
 * chip updates).
 *
 * Errors are surfaced via toast — the cancel itself is best-effort
 * server-side, but a missing/forbidden account is a real failure worth
 * showing.
 */
export function useCancelAnalysis() {
  const qc = useQueryClient()
  const { user } = useSession()

  return useMutation<{ accountId: string }, Error, string>({
    mutationKey: ['accounts', 'cancelAnalysis'],
    mutationFn: accountId => accountsApi.cancelAnalysis(accountId),
    onSuccess: ({ accountId }) => {
      qc.invalidateQueries({ queryKey: accountKeys.detail(accountId) })
      qc.invalidateQueries({ queryKey: accountKeys.list(user?.id) })
      toast.success(i18n.t('accounts:toast.analysisCancelled'))
    },
    onError: err => {
      toast.error(err instanceof Error ? err.message : i18n.t('accounts:toast.cancelError'))
    },
  })
}
