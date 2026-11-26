import { useEffect, useRef } from 'react'
import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query'
import type { ContactListQuery, ContactListResponse } from '@bellum/contracts'
import { contactKeys, contactsApi, type ContactsListQueryKey, type GlobalContact } from '@/features/contacts/api'
import { useSession } from '@/lib/hooks/use-session'
import { saveQuerySnapshot, toSnapshotKey, useHydrateFromSnapshot } from '@/lib/cache/idb/query-snapshots'

export type { GlobalContact }
const PAGE_SIZE = 25

/**
 * Reads the user's contacts from `GET /contacts`. Filtering is done
 * server-side; the `filters` object is part of the query key so each
 * combination is cached independently. Debounce `filters.q` upstream
 * for live search (cf. `useDebounce`).
 *
 * Snapshot persistence: we mirror the full `InfiniteData` (not a single
 * page) into IndexedDB whenever it changes so the hydration on next
 * mount restores the shape `useInfiniteQuery` expects.
 */
export function useContacts(filters: ContactListQuery = {}) {
  const { user } = useSession()
  const queryKey = [...contactKeys.list, user?.id, filters] satisfies ContactsListQueryKey
  useHydrateFromSnapshot<InfiniteData<ContactListResponse>>(queryKey)
  const query = useInfiniteQuery<ContactListResponse>({
    queryKey,
    queryFn: ({ pageParam }) => contactsApi.listPage({ ...filters, offset: pageParam as number, limit: PAGE_SIZE }),
    initialPageParam: 0,
    getNextPageParam: lastPage =>
      lastPage.pagination.hasNext ? lastPage.pagination.currentPage * lastPage.pagination.size : undefined,
    enabled: !!user,
    staleTime: 30_000,
  })

  const keyStr = toSnapshotKey(queryKey)
  const keyRef = useRef(queryKey)
  keyRef.current = queryKey
  useEffect(() => {
    if (query.data) void saveQuerySnapshot(keyRef.current, query.data)
  }, [query.data, keyStr])

  return query
}
