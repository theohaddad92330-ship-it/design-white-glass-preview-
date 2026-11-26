import type { PublicBanner } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/**
 * Public banner feed. Hits the unauthenticated `/banners` endpoint, which
 * returns only the currently-visible, non-sensitive banners for the app
 * surface. `authenticated` is a viewer-context hint so members-only banners can
 * be targeted — it is never a secret (the endpoint is public).
 */
export const bannersApi = {
  active(authenticated: boolean): Promise<{ banners: PublicBanner[] }> {
    const audience = authenticated ? 'authenticated' : 'all'
    return apiFetch<{ banners: PublicBanner[] }>({ path: `/banners?placement=app&audience=${audience}` })
  },
}
