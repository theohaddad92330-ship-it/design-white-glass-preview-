// Client for the API's feature-adoption-usage endpoint
// (GET /internal/analytics/feature-adoption, guarded by InternalSecretGuard).
// Server-side only — the internal secret never reaches the browser. Mirrors
// src/lib/retention.ts.

const REAL_BASE = process.env.API_BASE_URL ?? 'http://localhost:3012'
const REAL_SECRET = process.env.INTERNAL_API_SECRET ?? ''

/**
 * #1685 — le signal d'usage d'UNE fonction, tel que l'API l'agrège PAR PALIER
 * (jamais un identifiant d'espace).
 *
 * `activeWorkspaces: null` = aucun signal branché pour cette fonction (voir
 * `notWiredReason`) — JAMAIS 0 : « pas mesuré » n'est pas « mesuré à zéro ».
 *
 * Non exporté : seul `FeatureAdoptionUsageReport.signals` a besoin d'être
 * nommé par les appelants (`pnpm lint:exports:types`/knip refuse un type
 * exporté sans second lecteur).
 */
type FeatureAdoptionSignal = {
  feature: string
  eligibleWorkspaces: number
  activeWorkspaces: number | null
  windowDays: number
  signal: string | null
  notWiredReason: string | null
}

export type FeatureAdoptionUsageReport = {
  windowDays: number
  measuredAt: string
  signals: FeatureAdoptionSignal[]
}

/**
 * L'usage réel des 14 fonctions gatées par l'offre, agrégé par fonction à
 * travers tous les espaces (#1685).
 *
 * ⚠️ Jette quand l'API ne répond pas — l'appelant (`/produit/adoption`)
 * attrape et garde alors le résidu honnête existant (« pas encore
 * mesurable ») plutôt que d'inventer un 0 % : voir `page.tsx`.
 */
export async function fetchFeatureAdoptionUsage(): Promise<FeatureAdoptionUsageReport> {
  const res = await fetch(`${REAL_BASE}/internal/analytics/feature-adoption`, {
    headers: { 'x-internal-secret': REAL_SECRET },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Feature-adoption endpoint returned ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as FeatureAdoptionUsageReport
}
