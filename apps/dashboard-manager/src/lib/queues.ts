// Client for the API's operator BullMQ queue-viewer endpoints
// (GET /internal/admin/queues[...], guarded by InternalSecretGuard). Called
// server-side only — the internal secret must never reach the browser. Mirrors
// src/lib/admin.ts / src/lib/monitoring.ts. Mutations (retry/remove/clean) go
// through the DM route handlers → adminMutate (src/lib/admin.ts).

const REAL_BASE = process.env.API_BASE_URL ?? 'http://localhost:3012'
const REAL_SECRET = process.env.INTERNAL_API_SECRET ?? ''

// The states the viewer can browse + the ones it can bulk-clean. Mirrors the
// API DTOs (list-queue-jobs-query / clean-queue-query).
export const QUEUE_JOB_STATES = ['failed', 'waiting', 'active', 'delayed', 'completed'] as const
export type QueueJobState = (typeof QUEUE_JOB_STATES)[number]
export const CLEANABLE_QUEUE_STATES = ['failed', 'completed', 'delayed'] as const

// ── Types (mirror apps/api admin-queues.service.ts) ──────────────────────────

/**
 * Pourquoi une file n'a pas pu dire depuis quand elle attend. Vocabulaire
 * FERMÉ, décidé par l'API (`AdminQueueUnknownReason`) : un message d'exception
 * Redis porte l'URL de connexion, donc le mot de passe, et il ne doit jamais
 * atteindre un écran. L'écran traduit chacune de ces quatre raisons.
 */
export type QueueUnknownReason =
  | 'lecture-impossible'
  | 'comptes-et-file-divergent'
  | 'horodatage-illisible'
  | 'profondeur-illisible'

/**
 * Depuis quand le job le plus vieux attend — TROIS états qui ne se confondent
 * pas (#1662). Miroir exact de `AdminQueueOldestWaiting` côté API.
 *
 * ⚠️ Une file VIDE n'a pas un job de 0 minute : elle n'a pas de job du tout.
 * Et Redis injoignable ne rend pas une file saine — il rend un état inconnu,
 * qui se DIT. Le type union retire le moyen de confondre les deux : il n'y a
 * pas de champ nullable sur lequel écrire `?? 0`.
 */
export type QueueOldestWaiting =
  | { etat: 'vide' }
  | { etat: 'inconnu'; raison: QueueUnknownReason }
  | { etat: 'mesure'; plusVieuxMs: number }

export type QueueSummary = {
  name: string
  waiting: number
  active: number
  completed: number
  failed: number
  delayed: number
  paused: number
  /** Depuis quand ce qui attend, attend (#1662) — la seule chose qu'une
   *  profondeur ne dit pas. */
  oldestWaiting: QueueOldestWaiting
}

export type QueueJob = {
  id: string | null
  name: string
  data: Record<string, string>
  attemptsMade: number
  timestamp: number | null
  processedOn: number | null
  finishedOn: number | null
  failedReason: string | null
  stackTail: string | null
}

/** In-file only : c'est le retour de `fetchQueueJobs`, que les appelants lisent
 *  par inférence (knip refuse un type exporté sans lecteur hors de son fichier). */
type QueueJobsPage = {
  queue: string
  state: string
  limit: number
  offset: number
  total: number
  jobs: QueueJob[]
}

async function adminGet<T>(path: string): Promise<T> {
  const res = await fetch(`${REAL_BASE}/internal/admin${path}`, {
    headers: { 'x-internal-secret': REAL_SECRET },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Queues endpoint ${path} returned ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as T
}

export async function fetchQueues(): Promise<QueueSummary[]> {
  return adminGet<QueueSummary[]>('/queues')
}

export async function fetchQueueJobs(
  name: string,
  state: QueueJobState,
  limit = 50,
  offset = 0,
): Promise<QueueJobsPage> {
  const qs = new URLSearchParams({ state, limit: String(limit), offset: String(offset) })
  return adminGet<QueueJobsPage>(`/queues/${encodeURIComponent(name)}/jobs?${qs.toString()}`)
}
