// Client for the API's operator analysis-monitoring endpoints
// (GET /internal/admin/analyses[...], guarded by InternalSecretGuard). Called
// server-side only — the internal secret must never reach the browser. Mirrors
// src/lib/telemetry.ts / src/lib/admin.ts. Cross-tenant by design (the operator
// sees every user's analyses).

const REAL_BASE = process.env.API_BASE_URL ?? 'http://localhost:3012'
const REAL_SECRET = process.env.INTERNAL_API_SECRET ?? ''

// ── Types (mirror apps/api admin-analyses.service.ts) ────────────────────────

export type AdminAnalysisRow = {
  accountId: string
  companyName: string
  siren: string | null
  status: string
  commercialStatus: string | null
  userId: string
  email: string | null
  fullName: string | null
  workspaceId: string | null
  workspaceName: string | null
  costUsd: number | null
  priorityScore: number | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
  phasesCompleted: number
  lastPhase: string | null
  isZombie: boolean
}

type AdminAnalysesList = {
  rows: AdminAnalysisRow[]
  total: number
  limit: number
  offset: number
}

// In-file only (composed into AdminAnalysisAudit) — the DM has no knip gate, but
// keep the surface tidy and mirror the API shape.
type PhaseSource = { provider: string; status: string; detail: string }
type PhaseTelemetry = {
  name: string
  costUsd: number
  inputTokens: number
  outputTokens: number
  durationMs: number
  sources: PhaseSource[]
  sourceHealth: Record<string, string> | null
}
type CreditSignal = { provider: string; kind: 'credit' | 'quota' | 'rate' }
type RunHistory = {
  id: string
  status: string
  scopeMode: string | null
  siren: string | null
  costUsd: number | null
  createdAt: string
  completedAt: string | null
}

export type AdminAnalysisAudit = {
  accountId: string
  companyName: string
  siren: string | null
  status: string
  commercialStatus: string | null
  userId: string
  email: string | null
  fullName: string | null
  workspaceId: string | null
  workspaceName: string | null
  costUsd: number | null
  priorityScore: number | null
  createdAt: string
  updatedAt: string
  isZombie: boolean
  errorMessage: string | null
  errorPhase: string | null
  creditSignal: CreditSignal | null
  phaseTelemetry: PhaseTelemetry[]
  phasesCompleted: string[]
  correlationId: string | null
  correlationSource: 'outbox' | null
  iaConsoleQueryable: false
  sentrySearchUrl: string | null
  runs: RunHistory[]
}

type AdminAnalysesFilters = {
  search?: string
  status?: string
  from?: string
  to?: string
  limit?: number
  offset?: number
}

async function adminGet<T>(path: string): Promise<T> {
  const res = await fetch(`${REAL_BASE}/internal/admin${path}`, {
    headers: { 'x-internal-secret': REAL_SECRET },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Monitoring endpoint ${path} returned ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as T
}

function listQuery(filters: AdminAnalysesFilters): string {
  const qs = new URLSearchParams()
  if (filters.search) qs.set('search', filters.search)
  if (filters.status) qs.set('status', filters.status)
  if (filters.from) qs.set('from', filters.from)
  if (filters.to) qs.set('to', filters.to)
  qs.set('limit', String(filters.limit ?? 100))
  qs.set('offset', String(filters.offset ?? 0))
  return qs.toString()
}

export async function fetchAnalyses(filters: AdminAnalysesFilters = {}): Promise<AdminAnalysesList> {
  return adminGet<AdminAnalysesList>(`/analyses?${listQuery(filters)}`)
}

export async function fetchAnalysisAudit(accountId: string): Promise<AdminAnalysisAudit> {
  return adminGet<AdminAnalysisAudit>(`/analyses/${encodeURIComponent(accountId)}/audit`)
}

// ── #1650 — « quand le produit est utilisé » ─────────────────────────────────

/** Une tranche (jour × heure) de la grille des lancements. Miroir de
 *  `AdminAnalysesHeatmap` côté API. */
export type AnalysesHeatmapBucket = {
  /** Jour calendaire, `YYYY-MM-DD`, dans le fuseau que porte la charge utile. */
  day: string
  /** Heure locale 0-23. L'API rend les 24 ; la grille n'en DESSINE que 12. */
  hour: number
  count: number
  /** Les ESPACES concernés — jamais une personne (#1650, #1681). */
  workspaces: string[]
  /** Lancements dont l'espace n'a pas pu être résolu. Comptés, jamais nommés
   *  d'un nom inventé. */
  withoutWorkspace: number
}

export type AnalysesHeatmapPayload = {
  /** Le fuseau dans lequel l'API a lu les jours et les heures. Affiché tel quel
   *  plutôt que supposé : c'est le serveur qui a tranché, pas l'écran. */
  timeZone: string
  /** Les 7 jours de la fenêtre, du plus ancien au plus récent. */
  days: string[]
  /** L'instant de la LECTURE, dans ce fuseau — ce qui distingue une tranche à
   *  venir d'une tranche mesurée à zéro. */
  now: { day: string; hour: number }
  buckets: AnalysesHeatmapBucket[]
  /** Total sur la fenêtre ENTIÈRE (24 h), pas seulement sur la plage dessinée. */
  total: number
}

/**
 * La grille des analyses LANCÉES sur 7 jours glissants.
 *
 * ⚠️ Jette quand l'API ne répond pas — et c'est voulu : rendre une grille vide
 * sur une panne écrirait « Aucune analyse cette semaine » par-dessus une
 * indisponibilité. L'appelant attrape et affiche une ERREUR.
 */
export async function fetchAnalysesHeatmap(): Promise<AnalysesHeatmapPayload> {
  return adminGet<AnalysesHeatmapPayload>('/analyses/heatmap')
}
