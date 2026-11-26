import { useQuery } from '@tanstack/react-query'
import type { AccountSharePayload } from '@bellum/contracts'
import { apiBase } from '@/lib/api-origin'

/**
 * Fetches a public share by slug. Plain `fetch` (not `apiFetch`) so we never
 * leak a Bearer token to a public endpoint, and a 404 surfaces as `data:
 * null` for the consumer to render an empty state.
 */
export function usePublicShare(slug: string) {
  return useQuery<AccountSharePayload | null, Error>({
    queryKey: ['public-share', slug],
    queryFn: async () => {
      const res = await fetch(`${apiBase()}/share/${encodeURIComponent(slug)}`)
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`Failed to load share: ${res.status}`)
      return (await res.json()) as AccountSharePayload
    },
    retry: false,
    staleTime: 60_000,
  })
}
