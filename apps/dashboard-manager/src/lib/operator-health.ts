// Client de la route `GET /internal/health/dependencies` (guardée par
// InternalSecretGuard). Serveur uniquement : le secret interne ne doit jamais
// atteindre le navigateur. Même convention que `telemetry.ts` et `admin.ts`.
//
// #1660 — les onze dépendances de la page Santé, et ce qui casse vu du client.
// Ce fichier ne fait AUCUN calcul : l'état, la latence médiane, la série de
// disponibilité et le dernier incident sont dérivés côté API
// (`dependency-health.logic.ts`), seuil de fraîcheur compris. Les types
// ci-dessous ne font que redécrire la forme reçue.

const REAL_BASE = process.env.API_BASE_URL ?? 'http://localhost:3012'
const REAL_SECRET = process.env.INTERNAL_API_SECRET ?? ''

/**
 * `off` n'est PAS une panne : c'est une capacité qu'on a choisi de ne pas
 * brancher (« sans clé = no-op strict »). `unknown` n'en est pas une non plus :
 * c'est l'absence de mesure récente. Les peindre en rouge apprendrait à
 * l'opérateur à ignorer le rouge.
 */
export type DependencyState = 'up' | 'degraded' | 'down' | 'unknown' | 'off'

/** La latence médiane 24 h — une union, pour que « 0 ms » soit impossible à écrire. */
type MedianLatency =
  | { kind: 'measured'; ms: number; samples: number }
  | { kind: 'not_applicable' }
  | { kind: 'no_sample' }

/** Un jour de la série. `ratio: null` = aucune sonde ce jour-là (un TROU). */
type AvailabilityPoint = { day: string; ratio: number | null }

/** En-fichier seulement : knip refuse un type exporté que seul son propre fichier consomme. */
type LastIncident =
  | { kind: 'observed'; at: number; resolvedAt: number | null }
  | { kind: 'none_in_window'; windowDays: number }
  | { kind: 'unknown' }

/** En-fichier seulement : knip refuse un type exporté que seul son propre fichier consomme. */
type DependencyHealth = {
  state: DependencyState
  /** Instant de la dernière sonde, en ms. `null` = jamais sondée. */
  lastMeasuredAt: number | null
  medianLatency24h: MedianLatency
  availability7d: AvailabilityPoint[]
  lastIncident: LastIncident
}

/**
 * Une dépendance, dans l'un de ses deux régimes de mesure.
 *
 * `probe` porte son historique local. `usage` n'en a pas : son état vient des
 * analyses réellement exécutées, que l'écran lit par la route des sources —
 * `usageSource` est la seule table de correspondance, et elle vient de l'API.
 */
export type DependencyReading =
  | { id: string; label: string; cuts: string; configured: boolean; measuredBy: 'probe'; health: DependencyHealth }
  | { id: string; label: string; cuts: string; configured: boolean; measuredBy: 'usage'; usageSource: string }

/** En-fichier seulement : knip refuse un type exporté que seul son propre fichier consomme. */
type ClientFacingError = {
  capability: string
  workspacesAffected: number
  lastOccurredAt: string
  codes: string[]
}

export type ClientFacingErrorReport = {
  windowDays: number
  errors: ClientFacingError[]
  /** Lignes ÉCARTÉES parce qu'elles sont des erreurs de capacité, pas des
   *  incidents. Publié à dessein : taire un filtre fait passer un tableau
   *  partiel pour un tableau complet. */
  capacityErrorsExcluded: number
}

/** Supervision 30/09 — lecture impossible : distinct d'un rapport vide (« aucune erreur »). */
export type ClientFacingErrorsUnavailable = { status: 'unavailable'; windowDays: number }

/**
 * #2445.12 (épopée #2766) — une ligne de la chronologie d'incidents : QUAND
 * une capacité a cessé, ou repris, de répondre. Jamais le fournisseur (même
 * discipline que `ClientFacingError` ci-dessus).
 */
export type IncidentTimelineEntry = {
  /** #2445.12 (lot SRC5 28/09 soir) — pour adresser CET incident (impact, actions, communication). */
  id: string
  capability: string
  transition: 'degraded' | 'recovered'
  code: string | null
  occurredAt: string
}

export type IncidentTimelineReport = {
  entries: IncidentTimelineEntry[]
  /** #2445.12 — les incidents actuellement OUVERTS (dernière transition connue = « degraded »). */
  open: IncidentTimelineEntry[]
}

export type OperatorHealthReport = {
  generatedAt: string
  dependencies: DependencyReading[]
  clientFacingErrors: ClientFacingErrorReport | ClientFacingErrorsUnavailable
  incidentTimeline: IncidentTimelineReport
}

export async function fetchOperatorHealth(): Promise<OperatorHealthReport> {
  const res = await fetch(`${REAL_BASE}/internal/health/dependencies`, {
    headers: { 'x-internal-secret': REAL_SECRET },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Dependency-health endpoint returned ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as OperatorHealthReport
}
