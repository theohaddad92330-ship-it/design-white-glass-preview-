import type { InfiniteData } from '@tanstack/react-query'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { AccountListResponse } from '@bellum/contracts'
import { toast } from 'sonner'
import { i18n } from '@/i18n'
import { accountKeys, accountsApi } from '@/features/accounts/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * Mutation for `DELETE /accounts/:id`. The backend soft-deletes the row by
 * switching it to `deleted`; we still optimistically remove it from every
 * cached filter combination so the UI flips instantly regardless of the
 * active search/sort. Rolled back on error, refetched on settle.
 *
 * Read `mutation.variables` (the id mid-flight) to render a "Suppression…"
 * label on the row being removed.
 */
export function useDeleteAccount() {
  const qc = useQueryClient()
  const { user } = useSession()

  return useMutation<
    { deleted: true },
    Error,
    string,
    { previous: Array<[readonly unknown[], InfiniteData<AccountListResponse> | undefined]> }
  >({
    mutationKey: ['accounts', 'delete'],
    mutationFn: id => accountsApi.delete(id),
    onMutate: async id => {
      const queryKey = accountKeys.list(user?.id)
      await qc.cancelQueries({ queryKey })
      // Snapshot every cached filter combination so we can roll back precisely.
      const previous = qc.getQueriesData<InfiniteData<AccountListResponse>>({ queryKey })
      qc.setQueriesData<InfiniteData<AccountListResponse>>({ queryKey }, prev =>
        prev
          ? {
              ...prev,
              pages: prev.pages.map((page, i) => ({
                ...page,
                data: page.data.filter(a => a.id !== id),
                pagination:
                  i === 0
                    ? { ...page.pagination, totalItems: Math.max(0, page.pagination.totalItems - 1) }
                    : page.pagination,
              })),
            }
          : prev,
      )
      return { previous }
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) {
        for (const [key, data] of ctx.previous) qc.setQueryData(key, data)
      }
      toast.error(i18n.t('accounts:toast.deleteError'))
    },
    onSuccess: () => {
      toast.success(i18n.t('accounts:toast.accountDeleted'))
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: accountKeys.list(user?.id) })
    },
  })
}
