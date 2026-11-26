import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { managerApi } from '../api'

/**
 * Assign an account to a member, or release it (`assignedTo: null`).
 *
 * Invalidates the manager stats so the portfolio counts, the coverage bar and
 * the to-assign queue all re-derive from the server — never patched optimistically,
 * because the server may legitimately refuse (a rep cannot take a colleague's
 * account) and a wrong optimistic count is worse than a short spinner.
 */
export function useAssignAccount() {
  const { t } = useTranslation('manager')
  const qc = useQueryClient()

  return useMutation({
    mutationFn: ({ accountId, assignedTo }: { accountId: string; assignedTo: string | null }) =>
      managerApi.assignAccount(accountId, assignedTo),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: ['manager', 'team-stats'] })
      // Théo D — les portefeuilles de « Objectifs & affaires » et la fiche d'un membre lisent le même responsable.
      void qc.invalidateQueries({ queryKey: ['manager', 'team-business'] })
      void qc.invalidateQueries({ queryKey: ['manager', 'member'] })
      void qc.invalidateQueries({ queryKey: ['accounts'] })
      toast.success(variables.assignedTo === null ? t('assign.released') : t('assign.assigned'))
    },
    onError: (error: Error) => {
      const status = typeof error.cause === 'number' ? error.cause : null
      toast.error(status === 403 ? t('assign.forbidden') : t('assign.failed'))
    },
  })
}
