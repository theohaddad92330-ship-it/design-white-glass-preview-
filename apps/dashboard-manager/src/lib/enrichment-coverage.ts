const REAL_BASE = process.env.API_BASE_URL ?? 'http://localhost:3000'
const REAL_SECRET = process.env.INTERNAL_API_SECRET ?? ''

type ProviderShare = {
  provider: string
  resolved: number
  /** #3022 — parmi les résolutions créditées à ce fournisseur, la part qui laisse
   *  aussi le téléphone renseigné. Agrégé par fournisseur, jamais par personne. */
  phoneFoundRate: number
}
type MissingChannel = { channel: string; count: number }

export type EnrichmentCoverage = {
  days: number
  attempts: number
  resolved: number
  unresolved: number
  /** `null` quand rien n'a été tenté — jamais 0 %. */
  resolutionRate: number | null
  byProvider: ProviderShare[]
  missingChannels: MissingChannel[]
  /** Résolutions dues à un fournisseur AUTRE qu'Apollo. */
  resolvedByFallback: number
}

/**
 * La couverture de l'enrichissement. Backoffice UNIQUEMENT, même règle que les
 * coûts : un taux d'échec montré à un commercial se lit comme une promesse sur
 * le prochain enrichissement.
 */
export async function fetchEnrichmentCoverage(days = 30): Promise<EnrichmentCoverage> {
  const res = await fetch(`${REAL_BASE}/internal/analytics/enrichment-coverage?days=${days}`, {
    headers: { 'x-internal-secret': REAL_SECRET },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Endpoint couverture d'enrichissement : ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as EnrichmentCoverage
}

/** Nom lisible d'un fournisseur. Une clé inconnue s'affiche telle quelle plutôt
 *  que de disparaître : un fournisseur ajouté demain doit rester visible. */
export const PROVIDER_LABEL: Record<string, string> = {
  apollo: 'Apollo',
  salesql: 'SalesQL',
  dropcontact: 'Dropcontact',
  hunter: 'Hunter',
  lusha: 'Lusha',
  kaspr: 'Kaspr',
  fullenrich: 'FullEnrich',
}

export const CHANNEL_LABEL: Record<string, string> = {
  email: 'E-mail',
  phone: 'Téléphone',
  linkedin: 'LinkedIn',
}

/** Pourcentage lisible, ou tiret quand il n'y a rien à mesurer. */
export function formatRate(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)} %`
}
