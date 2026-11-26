// Client for the API's operator telemetry endpoint (GET /internal/telemetry,
// guarded by InternalSecretGuard). Called server-side only — the internal
// secret must never reach the browser. The dashboard always points at the REAL
// API.

const REAL_BASE = process.env.API_BASE_URL ?? 'http://localhost:3012'
const REAL_SECRET = process.env.INTERNAL_API_SECRET ?? ''

function endpoint(): { base: string; secret: string } {
  return { base: REAL_BASE, secret: REAL_SECRET }
}

// IA v2 grounding / sourcing KPI for one analysis. Mirror of the API's
// GroundingKpi (analysis-telemetry.service.ts). In-file only (referenced by the
// exported TelemetryRow) — knip flags lone type exports; the /ia view reads it
// via NonNullable<TelemetryRow['grounding']>.
type GroundingKpi = {
  sourcedFacts: number
  hypothesisFacts: number
  factsWithSource: number
  factsWithEvidence: number
  registrySize: number
  legalCitations: number
  sourcedRatio: number | null
  confidenceScore: number | null
  confidenceTier: string | null
}

export type TelemetryRow = {
  accountId: string
  companyName: string
  status: string
  costUsd: number | null
  priorityScore: number | null
  siren: string | null
  createdAt: string
  updatedAt: string
  /** Durée MESURÉE du run, ou `null` si aucun run terminé ne permet de la
   *  connaître. Jamais estimée depuis la ligne `accounts`, jamais plafonnée. */
  durationMs: number | null
  // Null for older runs with no sources/confidence block (honest empty state).
  grounding: GroundingKpi | null
}

type PhaseAggregate = {
  name: string
  runs: number
  avgCostUsd: number
  totalCostUsd: number
  avgDurationMs: number
  p50DurationMs: number
  p95DurationMs: number
  avgInputTokens: number
  avgOutputTokens: number
  avgCacheReadTokens: number
  avgCacheCreationTokens: number
}

type SourceHealth = {
  source: string
  ok: number
  degraded: number
}

// In-file only (CreditAlert['kind'] is consumed in page.tsx) — knip flags lone
// type exports, so this stays unexported.
type CreditSignalKind = 'credit' | 'quota' | 'rate'

// A REAL detected provider out-of-credit / quota / rate alert (from a failed
// analysis' stored error message). Surfaced as a red indicator in Monitoring.
export type CreditAlert = {
  accountId: string
  companyName: string
  provider: string
  kind: CreditSignalKind
  message: string
  occurredAt: string
}

// Per-provider spend. costUsd is only known for the metered LLM (Claude); the
// credit-based providers are call-attributed (metered: false, costUsd: null).
type ProviderSpend = {
  provider: string
  costUsd: number | null
  calls: number
  metered: boolean
}

// IA v2 grounding roll-up. In-file only (referenced by the exported
// TelemetryReport) — the /ia view reads it via TelemetryReport['groundingSummary'].
type GroundingSummary = {
  analysesWithGrounding: number
  avgSourcedRatio: number | null
  avgConfidenceScore: number | null
  totalRegistrySize: number
  totalLegalCitations: number
  withSourcedRatio: number
  meetingTarget: number
}

export type TelemetryReport = {
  analyses: TelemetryRow[]
  summary: {
    count: number
    /** null = aucune analyse chiffrée (jamais 0). */
    totalCostUsd: number | null
    avgCostUsd: number | null
    /** Analyses sans coût mesuré, exclues du total et de la moyenne. */
    unpricedCount?: number
  }
  phaseAggregate: PhaseAggregate[]
  sourceHealth: SourceHealth[]
  creditAlerts: CreditAlert[]
  providerSpend: ProviderSpend[]
  // Defensive optional: an older seed payload may omit it (page guards with ??).
  groundingSummary?: GroundingSummary
}

// In-file only (return type of fetchTelemetryDetail, inferred at call sites) —
// not exported, else knip flags an unused type export.
type ContactApolloDetails = {
  organization?: string
  seniority?: string
  departments?: string[]
  functions?: string[]
  headline?: string
  employmentHistory?: Array<{ title?: string | null; organization?: string | null; current?: boolean }>
}

type TopContact = {
  fullName: string
  title: string | null
  entity: string | null
  family: string | null
  decisionRole: string | null
  priority: number | null
  whyContact: string | null
  profileSummary: string | null
  email: string | null
  emailVerified: boolean
  phone: string | null
  linkedinUrl: string | null
  photoUrl: string | null
  city: string | null
  country: string | null
  apolloDetails: ContactApolloDetails | null
  message: string | null
  userStatus: string
  sourceTag: string
  bucket: string
  hierarchyLevel: string
  // Contact target-strength score /100 + one-line reason (V1-vendable §7.7).
  contactScore: number
  priorityReason: string
  // S5 qualification status (retour Thales : 8 statuts lisibles + 2 internes).
  qualifStatus?: string | null
  // Decider psychology (deck / ORION). Optional — populated once the phase-3
  // persistence carries them; the render is guarded on presence.
  careerLevers?: string[] | null
  implicitFears?: string[] | null
}

type PhaseTelemetry = {
  name: string
  costUsd: number
  // Supervision 30/09 : une phase peut ne pas avoir mesuré ces valeurs (null).
  inputTokens: number | null
  outputTokens: number | null
  durationMs: number | null
  sourceHealth?: Record<string, string>
  /** Per-phase execution trace: each provider/API called, its status + result. */
  sources?: Array<{ provider: string; status: string; detail: string }>
}

type TelemetryDetail = TelemetryRow & {
  priorityScore: number | null
  errorMessage: string | null
  rawAnalysis: Record<string, unknown> | null
  topContacts: TopContact[]
  phaseTelemetry: PhaseTelemetry[]
}

export async function fetchTelemetry(limit = 50): Promise<TelemetryReport> {
  const { base, secret } = endpoint()
  const res = await fetch(`${base}/internal/telemetry?limit=${limit}`, {
    headers: { 'x-internal-secret': secret },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Telemetry endpoint returned ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as TelemetryReport
}

// ── État des sources (GET /internal/telemetry/source-health) ────────────────

/** Statut d'une source externe sur la fenêtre. `unknown` n'est jamais produit
 *  par l'agrégation elle-même : c'est ce que RESTE une source dont aucun run
 *  n'a rien dit — l'écran le rend explicitement plutôt que de la peindre en vert. */
export type SourceState = 'ok' | 'degraded' | 'down' | 'unknown'

export type SourceStatus = {
  source: string
  state: SourceState
  runsObserved: number
  runsDegraded: number
  /** Plus ancien run de la panne EN COURS. Null si la source va bien. */
  degradedSince: string | null
  /** La série remonte au bord de la fenêtre : « au moins depuis », pas « depuis ». */
  degradedSinceIsWindowEdge: boolean
  lastOkAt: string | null
  lastReason: string | null
  /** Cause machine (`quota_exceeded`, `unauthorized`…) quand elle a été classée. */
  lastCode: string | null
}

export type SourceHealthReport = {
  window: {
    hours: number
    runsConsidered: number
    oldestRunAt: string | null
    newestRunAt: string | null
  }
  sources: SourceStatus[]
  /** Supervision 30/09 — lecture impossible côté API (≠ fenêtre sans run). */
  unavailable?: true
}

export async function fetchSourceHealth(hours = 24): Promise<SourceHealthReport> {
  const { base, secret } = endpoint()
  const res = await fetch(`${base}/internal/telemetry/source-health?hours=${hours}`, {
    headers: { 'x-internal-secret': secret },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Source-health endpoint returned ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as SourceHealthReport
}

// ── Interrupteurs d'arrêt (GET /internal/telemetry/kill-switches) ───────────

/**
 * L'état d'une capacité coupable à chaud.
 *
 * ⚠️ `cut` veut dire « coupée EXPRÈS » — c'est une décision d'exploitation, pas
 * une panne. L'écran doit dire « cette capacité est coupée », jamais « une
 * erreur s'est produite » : les deux appellent des gestes opposés.
 *
 * ⚠️ `unknown` n'est pas un habillage : le moteur IA vit dans un autre process,
 * et quand il ne répond pas, on ne SAIT PAS. Le peindre en vert serait le
 * `200 {"status":"degraded"}` compté `operational` — ce qui rend une panne
 * invisible.
 */
export type KillSwitchState = 'active' | 'cut' | 'unknown'

export type KillSwitchStatus = {
  /** Identifiant de CAPACITÉ. Jamais le nom d'une variable — voir GA-85. */
  id: string
  service: 'api' | 'ia'
  labelFr: string
  labelEn: string
  cutsFr: string
  cutsEn: string
  /** `user` = sans surface, le produit MENT à l'utilisateur quand c'est coupé. */
  audience: 'operator' | 'user'
  state: KillSwitchState
}

export type KillSwitchReport = {
  switches: KillSwitchStatus[]
  summary: { active: number; cut: number; unknown: number }
  iaReachable: boolean
  measuredAt: string
}

export async function fetchKillSwitches(): Promise<KillSwitchReport> {
  const { base, secret } = endpoint()
  const res = await fetch(`${base}/internal/telemetry/kill-switches`, {
    headers: { 'x-internal-secret': secret },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Kill-switch endpoint returned ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as KillSwitchReport
}

// ── Coût par prompt (GET /internal/telemetry/cost) ──────────────────────────
//
// LOT 10 — `GET /metrics/cost` existait côté moteur IA (`apps/ia/app/main.py`),
// répondait à la bonne question — « qu'est-ce qui coûte cher hors pipeline
// d'analyse : Copilote, discover, battlecard, weekly, compare, icebreaker,
// message, summary, scorer, activity » — et n'avait AUCUN appelant. Ce fichier
// en est le premier, sur le même patron que `fetchKillSwitches` juste
// au-dessus : le secret ne quitte jamais ce fichier serveur.

// `CostMetricsPrompt`/`CostMetricsTruncation` restent NON exportés — comme
// `GroundingKpi` un peu plus haut dans ce fichier : seule la forme englobante
// (`CostMetricsReport`) est consommée hors de ce fichier ; knip signale un type
// exporté et lu dans son seul fichier.

/** Une ligne de coût par PROMPT. */
type CostMetricsPrompt = {
  prompt: string
  calls: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  costUsd: number
  model: string
  /** Appels dont le TARIF du modèle est inconnu — `costUsd` ne les compte pas. */
  unpricedCalls: number
}

/** Générations tronquées (plafond `max_tokens` atteint) — un coût sans livrable. */
type CostMetricsTruncation = {
  events: number
  wastedOutputTokens: number
  wastedCostUsd: number
}

/**
 * `GET /internal/telemetry/cost` — ce que chaque prompt IA a coûté depuis le
 * démarrage du PROCESS.
 *
 * ⚠️ `reachable: false` ⇒ `totalCostUsd` vaut `null`, JAMAIS `0`. Le moteur IA
 * vit dans un autre process : un moteur muet ne prouve pas que la facture est
 * nulle — ce serait le « non mesuré affiché zéro » transposé au coût.
 *
 * ⚠️ Compteurs EN MÉMOIRE DU PROCESS IA : remis à zéro à chaque redéploiement,
 * non agrégés entre replicas. C'est voulu — un ordre de grandeur lisible en
 * direct, jamais une comptabilité. L'écran doit le dire.
 */
export type CostMetricsReport = {
  reachable: boolean
  prompts: CostMetricsPrompt[]
  totalCostUsd: number | null
  truncations: Record<string, CostMetricsTruncation>
  measuredAt: string
}

export async function fetchCostMetrics(): Promise<CostMetricsReport> {
  const { base, secret } = endpoint()
  const res = await fetch(`${base}/internal/telemetry/cost`, {
    headers: { 'x-internal-secret': secret },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Cost metrics endpoint returned ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as CostMetricsReport
}

export async function fetchTelemetryDetail(accountId: string): Promise<TelemetryDetail> {
  const { base, secret } = endpoint()
  const res = await fetch(`${base}/internal/telemetry/${encodeURIComponent(accountId)}`, {
    headers: { 'x-internal-secret': secret },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Detail endpoint returned ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as TelemetryDetail
}
