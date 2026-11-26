import type { ContactListQuery } from '@bellum/contracts'
import { useContacts } from './useContacts'

/** Thin selector reading the pagination total from the same query as the
 *  list. React Query dedupes by queryKey — calling `useContacts(filters)`
 *  here and in the list does NOT trigger a second fetch. */
export function useContactsTotal(filters: ContactListQuery): number {
  return useContacts(filters).data?.pages[0]?.pagination.totalItems ?? 0
}
