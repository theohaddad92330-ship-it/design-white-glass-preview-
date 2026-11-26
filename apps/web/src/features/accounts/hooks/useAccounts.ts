import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query'
import { saveQuerySnapshot } from '@/lib/cache/idb/query-snapshots'
import type { AccountListQuery, AccountListResponse } from '@bellum/contracts'
import { accountsApi, accountKeys, type AccountsListQueryKey } from '@/features/accounts/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * Reads the user's accounts from `GET /accounts`. All filtering and
 * sorting happens server-side — the `filters` object is part of the
 * query key so each combination is cached independently.
 *
 * For live search, debounce `filters.q` upstream (see `useDebounce`)
 * so we don't fire one request per keystroke.
 */
export function useAccounts(filters: AccountListQuery = {}) {
  const { user } = useSession()
  const limit = filters.limit ?? 25
  const queryKey = [...accountKeys.list(user?.id), filters] satisfies AccountsListQueryKey
  return useInfiniteQuery<AccountListResponse, Error, InfiniteData<AccountListResponse>, AccountsListQueryKey, number>({
    queryKey,
    queryFn: async ({ pageParam }) => {
      const page = await accountsApi.list({ ...filters, offset: pageParam, limit })
      void saveQuerySnapshot(queryKey, page)
      return page
    },
    initialPageParam: 0,
    getNextPageParam: lastPage =>
      lastPage.pagination.hasNext ? lastPage.pagination.currentPage * lastPage.pagination.size : undefined,
    enabled: !!user,
    staleTime: 30_000,
  })
}
