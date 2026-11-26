import type { AccountListItem, AccountListResponse } from '@bellum/contracts'
import type { InfiniteData } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { useAccountsStore } from '@/features/accounts/store/useAccountsStore'
import { useInfiniteScrollSentinel } from '@/lib/hooks/use-infinite-scroll-sentinel'

function dedupeById(accounts: AccountListItem[]): AccountListItem[] {
  return [...new Map(accounts.map(a => [a.id, a])).values()]
}

export function useAccountsCache(data: InfiniteData<AccountListResponse> | undefined): AccountListItem[] {
  const cachedAccounts = useAccountsStore(s => s.cachedAccounts)
  const setCachedAccounts = useAccountsStore(s => s.setCachedAccounts)

  const pagesAccounts = data?.pages.flatMap(p => p.data) ?? []
  const accounts = useMemo(
    () => dedupeById(pagesAccounts.length > 0 ? pagesAccounts : cachedAccounts),
    [cachedAccounts, pagesAccounts],
  )

  useEffect(() => {
    if (!data?.pages) return
    const latest = dedupeById(data.pages.flatMap(p => p.data))
    if (latest.length !== cachedAccounts.length) setCachedAccounts(latest)
  }, [cachedAccounts.length, data?.pages, setCachedAccounts])

  return accounts
}

export function useInfiniteScrollRef(opts: {
  hasNextPage: boolean
  isFetchingNextPage: boolean
  fetchNextPage: () => Promise<unknown>
}) {
  return useInfiniteScrollSentinel(opts)
}
