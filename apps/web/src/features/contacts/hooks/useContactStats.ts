import { useQuery } from '@tanstack/react-query'
import { contactKeys, contactsApi } from '../api'

export function useContactStats() {
  return useQuery({
    queryKey: contactKeys.stats,
    queryFn: contactsApi.getStats,
    staleTime: 60_000,
  })
}
