// Client for the API's ground-truth endpoints
// (GET/POST /internal/admin/market-memory-ground-truth/*, guarded by
// InternalSecretGuard). Called server-side only — the internal secret must
// never reach the browser. Mirrors src/lib/queues.ts. Mutations (submit a
// judgment) go through the DM route handler → adminMutate (src/lib/admin.ts),
// which is where `judgedBy` gets attached from the operator's session.

const REAL_BASE = process.env.API_BASE_URL ?? 'http://localhost:3012'
const REAL_SECRET = process.env.INTERNAL_API_SECRET ?? ''

// #1622 — LES SIX LABELS, dans l'ordre exact du retour. Mirroir volontaire de
// `MARKET_MEMORY_GROUND_TRUTH_LABELS` (@bellum/contracts) plutôt qu'un import
// : ce paquet expose son runtime via `dist/`, reconstruit à un autre rythme
// que ce back-office (voir `src/lib/queues.ts`, qui applique déjà ce choix
// pour les DTOs de l'API). Le TYPE seul, ici, n'a rien à synchroniser
// autrement que par une revue de code le jour où le contrat change — même
// statut que `QueueJob` un peu plus haut dans ce fichier jumeau.
export const MARKET_MEMORY_GROUND_TRUTH_LABELS = [
  'useful_and_correct',
  'plausible',
  'misleading',
  'wrong_entity',
  'irrelevant',
  'unknown',
] as const
export type MarketMemoryGroundTruthLabel = (typeof MARKET_MEMORY_GROUND_TRUTH_LABELS)[number]

type MarketMemoryGroundTruthReading = {
  hadReading: boolean
  rank: number | null
  persons: number | null
  certainty: 'forte' | 'moyenne' | 'faible' | null
}

export type MarketMemoryGroundTruthReaderResult =
  | { status: 'ok'; reading: MarketMemoryGroundTruthReading }
  | { status: 'unavailable'; reason: string }

export type MarketMemoryGroundTruthJudgment = {
  id: string
  case: {
    accountName: string
    accountWebsite: string | null
    accountCountry: string | null
    esnName: string
  }
  reading: MarketMemoryGroundTruthReading
  label: MarketMemoryGroundTruthLabel
  judgedBy: string
  judgedAt: string
}

/**
 * Le rendu d'UNE métrique — jamais un nombre nu. Mirroir de
 * `MarketMemoryGroundTruthMetricResult` (@bellum/contracts). Ce back-office
 * n'a jamais besoin de DIVISER lui-même : l'API rend déjà la métrique
 * résolue, `insufficient_data` ou `measured` — voir GA-285
 * (`market-memory-ground-truth-metric-floor.spec.ts`), qui interdit
 * justement à un fichier comme celui-ci de refaire ce calcul.
 */
export type MarketMemoryGroundTruthMetricResult =
  | { status: 'insufficient_data'; judgmentsCount: number; required: number }
  | { status: 'measured'; value: number; judgmentsCount: number }

export const MARKET_MEMORY_GROUND_TRUTH_METRIC_NAMES = [
  'precision_at_3',
  'precision_at_10',
  'false_positive_rate',
  'coverage',
  'entity_resolution_failure',
  'human_usefulness',
] as const
export type MarketMemoryGroundTruthMetricName = (typeof MARKET_MEMORY_GROUND_TRUTH_METRIC_NAMES)[number]

export type MarketMemoryGroundTruthMetrics = Record<
  MarketMemoryGroundTruthMetricName,
  MarketMemoryGroundTruthMetricResult
>

async function groundTruthGet<T>(path: string): Promise<T> {
  const res = await fetch(`${REAL_BASE}/internal/admin/market-memory-ground-truth${path}`, {
    headers: { 'x-internal-secret': REAL_SECRET },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Ground-truth endpoint ${path} returned ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as T
}

type GroundTruthLookupInput = {
  accountName: string
  accountWebsite?: string
  accountCountry?: string
  esnName: string
}

export async function fetchGroundTruthReading(
  input: GroundTruthLookupInput,
): Promise<MarketMemoryGroundTruthReaderResult> {
  const params = new URLSearchParams()
  params.set('accountName', input.accountName)
  if (input.accountWebsite) params.set('accountWebsite', input.accountWebsite)
  if (input.accountCountry) params.set('accountCountry', input.accountCountry)
  params.set('esnName', input.esnName)
  return groundTruthGet<MarketMemoryGroundTruthReaderResult>(`/lookup?${params.toString()}`)
}

export async function fetchGroundTruthJudgments(): Promise<MarketMemoryGroundTruthJudgment[]> {
  return groundTruthGet<MarketMemoryGroundTruthJudgment[]>('/judgments')
}

export async function fetchGroundTruthMetrics(): Promise<MarketMemoryGroundTruthMetrics> {
  return groundTruthGet<MarketMemoryGroundTruthMetrics>('/metrics')
}
