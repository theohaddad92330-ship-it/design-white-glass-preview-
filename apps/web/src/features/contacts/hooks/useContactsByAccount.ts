import { useQuery } from '@tanstack/react-query'
import type { Contact } from '@bellum/contracts'
import { contactKeys, contactsApi } from '@/features/contacts/api'
import { saveQuerySnapshot, useHydrateFromSnapshot } from '@/lib/cache/idb/query-snapshots'

/**
 * Contacts attached to a single account. Query is disabled when `accountId`
 * is null so callers can pass the current selection directly. Shares the
 * cache key with `useAccount(id)` so concurrent reads dedupe to one fetch.
 */
export function useContactsByAccount(accountId: string | null) {
  const queryKey = accountId ? contactKeys.byAccount(accountId) : contactKeys.list
  useHydrateFromSnapshot<Contact[]>(queryKey)
  return useQuery<Contact[]>({
    queryKey,
    queryFn: async () => {
      const data = await contactsApi.listByAccount(accountId!)
      void saveQuerySnapshot(queryKey, data)
      return data
    },
    enabled: !!accountId,
  })
}
