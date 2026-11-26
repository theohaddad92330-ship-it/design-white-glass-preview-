// Server-side client for the API's admin banner endpoints
// (GET /internal/admin/banners + mutations), guarded by InternalSecretGuard.
// The internal secret never reaches the browser — this module and the route
// handlers under /api/admin/banners are server-side only. Reads use a small
// local GET; writes reuse the shared `adminMutate` proxy from ./admin.
//
// Types are declared locally (the DM mirrors API shapes rather than depending
// on @bellum/contracts — same pattern as ./admin). The API re-validates every
// write body with Zod, so these are just the client-facing shapes.

import { adminMutate } from './admin'

type BannerKind = 'announcement' | 'maintenance' | 'offer'
type BannerVariant = 'info' | 'success' | 'warning' | 'critical'
type BannerPlacement = 'app' | 'website' | 'both'
type BannerAudience = 'all' | 'authenticated'

export type AdminBanner = {
  id: string
  kind: BannerKind
  variant: BannerVariant
  titleFr: string
  titleEn: string
  bodyFr: string
  bodyEn: string
  ctaLabelFr: string | null
  ctaLabelEn: string | null
  ctaUrl: string | null
  placement: BannerPlacement
  audience: BannerAudience
  startsAt: string | null
  endsAt: string | null
  dismissible: boolean
  priority: number
  active: boolean
  version: number
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

/** Payload the create/edit form submits. The API re-validates it (Zod).
 *  `endsAt` is required (#1667.2) — a banner without an end date stays on
 *  client screens forever; `startsAt` alone may still be open (`null`). */
export type BannerWriteInput = {
  kind: BannerKind
  variant: BannerVariant
  placement: BannerPlacement
  audience: BannerAudience
  titleFr: string
  titleEn: string
  bodyFr: string
  bodyEn: string
  ctaLabelFr: string | null
  ctaLabelEn: string | null
  ctaUrl: string | null
  startsAt: string | null
  endsAt: string
  dismissible: boolean
  priority: number
  active: boolean
}

const REAL_BASE = process.env.API_BASE_URL ?? 'http://localhost:3012'
const REAL_SECRET = process.env.INTERNAL_API_SECRET ?? ''

export async function fetchAdminBanners(): Promise<AdminBanner[]> {
  const res = await fetch(`${REAL_BASE}/internal/admin/banners`, {
    headers: { 'x-internal-secret': REAL_SECRET },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Admin banners endpoint returned ${res.status} ${res.statusText}`)
  }
  const data = (await res.json()) as { banners?: AdminBanner[] }
  return data.banners ?? []
}

export function createBanner(body: BannerWriteInput) {
  return adminMutate('POST', '/banners', body)
}

export function updateBanner(id: string, body: Partial<BannerWriteInput>) {
  return adminMutate('PATCH', `/banners/${encodeURIComponent(id)}`, body)
}

export function toggleBanner(id: string, active: boolean) {
  return adminMutate('PATCH', `/banners/${encodeURIComponent(id)}/toggle`, { active })
}

export function deleteBanner(id: string) {
  return adminMutate('DELETE', `/banners/${encodeURIComponent(id)}`)
}

/** Live scheduling state for the list view, derived from active + window. */
type BannerStatus = 'live' | 'scheduled' | 'expired' | 'inactive'

export function bannerStatus(b: AdminBanner, now: Date = new Date()): BannerStatus {
  if (!b.active) return 'inactive'
  const t = now.getTime()
  if (b.startsAt && new Date(b.startsAt).getTime() > t) return 'scheduled'
  if (b.endsAt && new Date(b.endsAt).getTime() < t) return 'expired'
  return 'live'
}
