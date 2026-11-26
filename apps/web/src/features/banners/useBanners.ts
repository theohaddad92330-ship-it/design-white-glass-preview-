import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { PublicBanner } from '@bellum/contracts'
import { useSession } from '@/lib/hooks/use-session'
import { bannersApi } from './api'

const POLL_INTERVAL_MS = 5 * 60_000

/**
 * The currently-active app banners for the viewer. Polled every few minutes so
 * a freshly-published (or scheduled) banner appears without a reload. The
 * audience follows the session (signed-in vs anonymous). Runs for anonymous
 * viewers too — the endpoint is public.
 */
export function useActiveBanners(): UseQueryResult<PublicBanner[]> {
  const { user } = useSession()
  const authenticated = !!user
  return useQuery({
    queryKey: ['banners', 'app', authenticated],
    queryFn: () => bannersApi.active(authenticated).then(r => r.banners),
    staleTime: 60_000,
    refetchInterval: POLL_INTERVAL_MS,
  })
}
