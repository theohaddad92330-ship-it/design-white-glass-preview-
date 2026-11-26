import { Injectable, Logger } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { detectCreditSignal } from '../analysis/analysis-telemetry.service'

// ── Tunables ───────────────────────────────────────────────────────────────
// An `analyzing` run whose row hasn't been touched for this long has almost
// certainly died without a terminal event (the worker stamps cost/telemetry
// after every phase, so `updated_at` bumps during a live run). Comfortably
// above the worker's 20-min JOB_TIMEOUT_MS + retry/backoff so a legitimately
// long run is never mis-flagged.
const ZOMBIE_THRESHOLD_MINUTES = 30
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

/**
 * #1650 — the time zone the operator console READS its hours in.
 *
 * A day × hour grid has no meaning without one: Railway runs the API in UTC and
 * the operator reads the screen in Paris, so "usage concentrated on Monday
 * morning" would be off by one or two hours, and by a whole DAY for anything
 * launched after 22:00. The back-office is an internal tool read from Paris, so
 * the zone is fixed rather than taken from the reader — the renderer does not
 * know the reader's zone at render time anyway. The web console keeps the same
 * decision, and the same value, in `apps/dashboard-manager/src/lib/dates.ts`
 * (`FUSEAU_CONSOLE`); this payload SHIPS the zone it used so the screen can
 * label the grid with the server's answer instead of assuming one.
 */
const CONSOLE_TIME_ZONE = 'Europe/Paris'

/** Sliding window of the launch heatmap. Seven days, never a month: a month is
 *  unreadable (issue #1650), and a week shows the weekly rhythm it is about. */
const HEATMAP_WINDOW_DAYS = 7

// The four canonical pipeline phases, in order — used to name the phase a
// failed run stopped at (the first expected phase missing from its trace).
const PHASE_ORDER = ['research', 'contacts', 'classify', 'plan'] as const

/** One provider call inside a phase's execution trace (from the IA `_phase_trace`
 *  / envelopes, persisted into `raw_analysis.phase_telemetry[].sources`). */
type PhaseSource = { provider: string; status: string; detail: string }

/** Per-phase audit record persisted by the worker into
 *  `raw_analysis.phase_telemetry`. In-file only (composed into the exported
 *  audit) — knip flags lone type exports. */
type PhaseTelemetry = {
  name: string
  costUsd: number
  inputTokens: number
  outputTokens: number
  durationMs: number
  sources: PhaseSource[]
  sourceHealth: Record<string, string> | null
}

/** One row of the cross-user analyses list. Cross-tenant by design (operator
 *  monitoring behind `InternalSecretGuard`). Carries only what a backoffice
 *  legitimately needs to triage a run — never tokens/secrets/password hashes. */
interface AdminAnalysisRow {
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
  /** # of phases with a persisted telemetry record (how far the run got). */
  phasesCompleted: number
  /** Name of the last phase that produced a telemetry record, if any. */
  lastPhase: string | null
  /** `analyzing` for longer than the zombie threshold with no fresh update. */
  isZombie: boolean
}

export interface AdminAnalysesList {
  rows: AdminAnalysisRow[]
  total: number
  limit: number
  offset: number
}

/** A detected provider out-of-credit / quota / rate signal on a failed run. */
interface AdminCreditSignal {
  provider: string
  kind: 'credit' | 'quota' | 'rate'
}

/** One prior run of the account (append-only `analysis_runs` history). */
interface AdminRunHistory {
  id: string
  status: string
  scopeMode: string | null
  siren: string | null
  costUsd: number | null
  createdAt: string
  completedAt: string | null
}

/** Full operator "audit" of one analysis — the debugging view. */
export interface AdminAnalysisAudit {
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
  // ── Failure surface ──
  errorMessage: string | null
  /** First expected phase missing from the trace = where the run stopped. */
  errorPhase: string | null
  creditSignal: AdminCreditSignal | null
  // ── Per-phase audit (cost / tokens / providers ok·down·skipped) ──
  phaseTelemetry: PhaseTelemetry[]
  phasesCompleted: string[]
  // ── Correlation / observability ──
  /** Real correlation id for this run, read from the outbox event stream. */
  correlationId: string | null
  correlationSource: 'outbox' | null
  /**
   * The IA service's live console/logs are NOT queryable from the API (they go
   * to Winston → Sentry/Grafana, not a DB the API owns). Always false — the UI
   * surfaces the correlation id + Sentry link instead of faking a console.
   */
  iaConsoleQueryable: false
  /** Sentry issue-search URL scoped to this correlation id, when the operator
   *  has configured SENTRY_ORG_SLUG; else null (correlation id shown regardless). */
  sentrySearchUrl: string | null
  runs: AdminRunHistory[]
}

/** One (Paris day, Paris hour) slot of the launch heatmap. In-file only —
 *  composed into the exported {@link AdminAnalysesHeatmap}. */
interface AdminAnalysesHeatmapBucket {
  /** Paris calendar day, `YYYY-MM-DD`. */
  day: string
  /** Paris local hour, 0-23. The 8h–20h framing is a DISPLAY choice; the payload
   *  carries every hour so the screen can say what it is not drawing. */
  hour: number
  /** Analyses LAUNCHED in that slot. A slot with no row is absent here, and the
   *  screen fills it with a true measured zero — a launched-nothing hour really
   *  did have zero launches. */
  count: number
  /** Workspaces (ESN) concerned, deduplicated. NEVER a person: #1650 counts
   *  analyses and names spaces, it does not measure anybody. */
  workspaces: string[]
  /** Launches whose workspace could not be resolved (`workspace_id` is nullable
   *  by design). Counted honestly rather than dropped or given an invented name. */
  withoutWorkspace: number
}

/** « Quand le produit est utilisé » — the 7-day launch heatmap (#1650). */
export interface AdminAnalysesHeatmap {
  /** The zone every `day`/`hour` in this payload is expressed in. */
  timeZone: string
  /** The 7 Paris calendar days of the window, oldest → newest. */
  days: string[]
  /** The read instant, in Paris. Lets the screen tell an hour that has not
   *  happened yet from an hour that measured zero — « 0 » would be false for the
   *  first one. */
  now: { day: string; hour: number }
  buckets: AdminAnalysesHeatmapBucket[]
  /** Launches over the WHOLE window, all 24 hours. The screen's "no analysis
   *  this week" hangs on this one, not on the 8h–20h subtotal. */
  total: number
}

// In-file only (the controller passes an object literal) — knip flags exported
// types consumed only in their own file.
interface AdminAnalysesFilters {
  search?: string
  status?: string
  from?: string
  to?: string
  limit?: number
  offset?: number
}

// ── Column list shared by list + audit (cross-tenant: NO user_id scope) ──────
// api_cost_euros is the USD figure the worker accumulates (the `_euros` name is
// legacy). phase_telemetry length = how far the run got.
const ROW_COLUMNS = `
  a.id                                                                              AS "accountId",
  a.company_name                                                                    AS "companyName",
  a.siren                                                                           AS "siren",
  a.status                                                                          AS "status",
  a.commercial_status                                                               AS "commercialStatus",
  a.user_id                                                                         AS "userId",
  p.email                                                                           AS "email",
  p.first_name                                                                      AS "firstName",
  p.last_name                                                                       AS "lastName",
  a.workspace_id                                                                    AS "workspaceId",
  w.name                                                                            AS "workspaceName",
  a.api_cost_euros::float8                                                          AS "costUsd",
  a.priority_score                                                                  AS "priorityScore",
  a.error_message                                                                   AS "errorMessage",
  a.created_at                                                                      AS "createdAt",
  a.updated_at                                                                      AS "updatedAt",
  COALESCE(
    CASE WHEN jsonb_typeof(a.raw_analysis->'phase_telemetry') = 'array'
         THEN jsonb_array_length(a.raw_analysis->'phase_telemetry') ELSE 0 END, 0)::int AS "phasesCompleted",
  a.raw_analysis->'phase_telemetry'->-1->>'name'                                    AS "lastPhase"
`

const JOINS = `
  FROM accounts a
  LEFT JOIN profiles p   ON p.user_id = a.user_id
  LEFT JOIN workspaces w ON w.id = a.workspace_id
`

function num(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  return typeof value === 'string' ? value : ''
}

function fullName(first: unknown, last: unknown): string | null {
  const parts = [first, last].filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
  const joined = parts.join(' ').trim()
  return joined.length > 0 ? joined : null
}

function clampLimit(limit: number | undefined): number {
  const n = Number(limit)
  if (!Number.isFinite(n)) return DEFAULT_LIMIT
  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(n)))
}

/** Coerce a persisted phase_telemetry blob into the typed shape the UI reads. */
function coercePhaseTelemetry(raw: unknown): PhaseTelemetry[] {
  if (!Array.isArray(raw)) return []
  return raw.map(p => {
    const o = (p ?? {}) as Record<string, unknown>
    const sources = Array.isArray(o.sources)
      ? (o.sources as Array<Record<string, unknown>>).map(s => ({
          provider: String(s?.provider ?? ''),
          status: String(s?.status ?? ''),
          detail: String(s?.detail ?? ''),
        }))
      : []
    const sh = o.sourceHealth
    return {
      name: String(o.name ?? ''),
      costUsd: num(o.costUsd) ?? 0,
      inputTokens: num(o.inputTokens) ?? 0,
      outputTokens: num(o.outputTokens) ?? 0,
      durationMs: num(o.durationMs) ?? 0,
      sources,
      sourceHealth: sh && typeof sh === 'object' ? (sh as Record<string, string>) : null,
    }
  })
}

/** Build a Sentry issue-search URL scoped to a correlation id, IF the operator
 *  configured an org slug. Honest no-op (null) otherwise — the UI still shows the
 *  correlation id so the operator can search manually. */
function buildSentrySearchUrl(correlationId: string | null): string | null {
  const org = process.env['SENTRY_ORG_SLUG']
  if (!org || !correlationId) return null
  const project = process.env['SENTRY_PROJECT_SLUG']
  const projectQs = project ? `&project=${encodeURIComponent(project)}` : ''
  return `https://${encodeURIComponent(org)}.sentry.io/issues/?query=${encodeURIComponent(`correlation_id:${correlationId}`)}${projectQs}`
}

// ── #1650 — the Paris window of the launch heatmap ──────────────────────────

/** Reads a calendar day + hour out of an instant, in the console's zone. */
const PARIS_PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: CONSOLE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hour12: false,
})

function parisDayAndHour(instant: Date): { day: string; hour: number } {
  const parts = PARIS_PARTS.formatToParts(instant)
  const part = (type: string): string => parts.find(p => p.type === type)?.value ?? ''
  // `hour12: false` renders midnight as `24` on some ICU builds — `% 24` keeps
  // it inside 0-23 rather than producing a 25th hour nobody can draw.
  const hour = Number(part('hour'))
  return {
    day: `${part('year')}-${part('month')}-${part('day')}`,
    hour: Number.isFinite(hour) ? hour % 24 : 0,
  }
}

/** Walk N calendar days back from `YYYY-MM-DD`. Anchored on UTC ON PURPOSE: a
 *  calendar day has no instant, and adding 24 h to a local instant lands on the
 *  same day twice the night the clocks go back. */
function shiftCalendarDay(day: string, delta: number): string {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number)
  const shifted = new Date(Date.UTC(year, month - 1, date) + delta * 86_400_000)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`
}

/**
 * The sliding window, resolved in Paris.
 *
 * ⚠️ `now` is a PARAMETER, never `new Date()` inside. A derivation that reads
 * the clock cannot be tested: it passes on a Paris laptop and fails on a UTC CI
 * runner, which is the same defect this whole function exists to prevent.
 */
export function parisWindow(
  now: Date,
  days: number = HEATMAP_WINDOW_DAYS,
): { days: string[]; now: { day: string; hour: number } } {
  const here = parisDayAndHour(now)
  const span = Math.max(1, Math.trunc(days))
  const window: string[] = []
  for (let i = span - 1; i >= 0; i -= 1) window.push(shiftCalendarDay(here.day, -i))
  return { days: window, now: here }
}

/**
 * Cross-tenant read model for the operator "analysis monitoring" backoffice
 * (behind `InternalSecretGuard`). Sibling of {@link AdminOpsService}: same
 * `internal/admin` surface, same raw-SQL-over-DataSource approach, NEVER
 * user-scoped. Read-only — the STOP / force-error mutations go through
 * `AnalysisService.cancelByAdmin` (the shared user-cancel machinery), not here.
 */
@Injectable()
export class AdminAnalysesService {
  private readonly logger = new Logger(AdminAnalysesService.name)

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Cross-user analyses list with filters (email/company/siren search, status,
   *  created-at window). `status: 'zombie'` selects stuck `analyzing` rows. */
  async listAnalyses(filters: AdminAnalysesFilters = {}): Promise<AdminAnalysesList> {
    const limit = clampLimit(filters.limit)
    const offset = Math.max(0, Math.trunc(Number(filters.offset) || 0))

    // Build the WHERE incrementally with positional params. Hidden by default:
    // soft-deleted accounts (status 'deleted').
    const where: string[] = [`a.status <> 'deleted'`]
    const whereParams: unknown[] = []
    const search = filters.search?.trim()
    if (search) {
      whereParams.push(`%${search}%`)
      const p = `$${whereParams.length}`
      where.push(`(a.company_name ILIKE ${p} OR p.email ILIKE ${p} OR a.siren ILIKE ${p})`)
    }
    if (filters.status) {
      if (filters.status === 'zombie') {
        whereParams.push(ZOMBIE_THRESHOLD_MINUTES)
        where.push(
          `(a.status = 'analyzing' AND a.updated_at < now() - make_interval(mins => $${whereParams.length}::int))`,
        )
      } else {
        whereParams.push(filters.status)
        where.push(`a.status = $${whereParams.length}`)
      }
    }
    if (filters.from) {
      whereParams.push(filters.from)
      where.push(`a.created_at >= $${whereParams.length}::timestamptz`)
    }
    if (filters.to) {
      whereParams.push(filters.to)
      where.push(`a.created_at <= $${whereParams.length}::timestamptz`)
    }
    const whereSql = `WHERE ${where.join(' AND ')}`

    // The SELECT's isZombie flag + pagination take their own trailing params so
    // the COUNT query can reuse whereParams verbatim.
    const listParams = [...whereParams]
    listParams.push(ZOMBIE_THRESHOLD_MINUTES)
    const zombieP = `$${listParams.length}`
    listParams.push(limit)
    const limitP = `$${listParams.length}`
    listParams.push(offset)
    const offsetP = `$${listParams.length}`

    const listSql = `
      SELECT ${ROW_COLUMNS},
        (a.status = 'analyzing' AND a.updated_at < now() - make_interval(mins => ${zombieP}::int)) AS "isZombie"
      ${JOINS}
      ${whereSql}
      ORDER BY a.updated_at DESC
      LIMIT ${limitP} OFFSET ${offsetP}
    `
    const countSql = `SELECT COUNT(*)::int AS total ${JOINS} ${whereSql}`

    try {
      const [rows, countRows] = await Promise.all([
        this.dataSource.query(listSql, listParams) as Promise<Array<Record<string, unknown>>>,
        this.dataSource.query(countSql, whereParams) as Promise<Array<Record<string, unknown>>>,
      ])
      return {
        rows: (rows ?? []).map(r => this.toRow(r)),
        total: Number(countRows?.[0]?.['total'] ?? 0),
        limit,
        offset,
      }
    } catch (error) {
      this.logger.error('listAnalyses error', { error })
      return { rows: [], total: 0, limit, offset }
    }
  }

  /** Full operator audit of one analysis, or `null` when it doesn't exist. */
  async getAudit(accountId: string): Promise<AdminAnalysisAudit | null> {
    const detailSql = `
      SELECT ${ROW_COLUMNS},
        a.raw_analysis->'phase_telemetry' AS "phaseTelemetryRaw",
        (a.status = 'analyzing' AND a.updated_at < now() - make_interval(mins => $2::int)) AS "isZombie"
      ${JOINS}
      WHERE a.id = $1
      LIMIT 1
    `
    const correlationSql = `
      SELECT payload->>'correlationId' AS "correlationId"
      FROM outbox
      WHERE payload->>'accountId' = $1 AND payload->>'correlationId' IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 1
    `
    const runsSql = `
      SELECT id, status, scope_mode AS "scopeMode", siren, cost_eur::float8 AS "costUsd",
             created_at AS "createdAt", completed_at AS "completedAt"
      FROM analysis_runs
      WHERE account_id = $1
      ORDER BY created_at DESC
      LIMIT 20
    `

    let detailRows: Array<Record<string, unknown>>
    try {
      detailRows = (await this.dataSource.query(detailSql, [accountId, ZOMBIE_THRESHOLD_MINUTES])) as Array<
        Record<string, unknown>
      >
    } catch (error) {
      this.logger.error('getAudit detail error', { error, accountId })
      return null
    }
    const d = detailRows?.[0]
    if (!d) return null

    // The correlation + run-history reads are best-effort — a blip on either
    // must not sink the audit (the failure surface is the important part).
    const [correlationRows, runRows] = await Promise.all([
      (this.dataSource.query(correlationSql, [accountId]) as Promise<Array<Record<string, unknown>>>).catch(() => []),
      (this.dataSource.query(runsSql, [accountId]) as Promise<Array<Record<string, unknown>>>).catch(() => []),
    ])

    const phaseTelemetry = coercePhaseTelemetry(d['phaseTelemetryRaw'])
    const phasesCompleted = phaseTelemetry.map(p => p.name).filter(Boolean)
    const errorPhase = PHASE_ORDER.find(name => !phasesCompleted.includes(name)) ?? null
    const errorMessage = str(d['errorMessage'])
    const signal = detectCreditSignal(errorMessage)
    const correlationId = str(correlationRows?.[0]?.['correlationId'])

    return {
      accountId: String(d['accountId'] ?? ''),
      companyName: String(d['companyName'] ?? ''),
      siren: str(d['siren']),
      status: String(d['status'] ?? ''),
      commercialStatus: str(d['commercialStatus']),
      userId: String(d['userId'] ?? ''),
      email: str(d['email']),
      fullName: fullName(d['firstName'], d['lastName']),
      workspaceId: str(d['workspaceId']),
      workspaceName: str(d['workspaceName']),
      costUsd: num(d['costUsd']),
      priorityScore: num(d['priorityScore']),
      createdAt: iso(d['createdAt']),
      updatedAt: iso(d['updatedAt']),
      isZombie: d['isZombie'] === true,
      errorMessage,
      // Only name a stopped-at phase when the run isn't complete (a completed
      // run with all phases has no missing phase, but a canceled/error one does).
      errorPhase: d['status'] === 'completed' ? null : errorPhase,
      creditSignal: signal,
      phaseTelemetry,
      phasesCompleted,
      correlationId,
      correlationSource: correlationId ? 'outbox' : null,
      iaConsoleQueryable: false,
      sentrySearchUrl: buildSentrySearchUrl(correlationId),
      runs: (runRows ?? []).map(r => ({
        id: String(r['id'] ?? ''),
        status: String(r['status'] ?? ''),
        scopeMode: str(r['scopeMode']),
        siren: str(r['siren']),
        costUsd: num(r['costUsd']),
        createdAt: iso(r['createdAt']),
        completedAt: r['completedAt'] ? iso(r['completedAt']) : null,
      })),
    }
  }

  /**
   * « Quand le produit est utilisé » — analyses LAUNCHED per Paris day × hour
   * over a sliding 7-day window, with the workspaces concerned (#1650).
   *
   * WHY `analysis_runs` AND NOT `accounts`
   * A row of `analysis_runs` IS a launch: append-only, one immutable row per
   * run, stamped `created_at` at launch time. `accounts` keeps ONE row per
   * company and is overwritten on every re-analysis, so counting it would drop
   * every re-run — precisely the repeated usage this grid is meant to show.
   *
   * ⚠️ WHY THIS ONE THROWS WHERE `listAnalyses` SWALLOWS
   * An empty result here is indistinguishable from a real week without
   * analyses, and the screen answers that with « Aucune analyse cette semaine ».
   * Swallowing a database failure would print that sentence over an outage. An
   * unreadable week is not a week without analyses, so the failure travels.
   */
  async getLaunchHeatmap(now: Date): Promise<AdminAnalysesHeatmap> {
    const window = parisWindow(now, HEATMAP_WINDOW_DAYS)
    const first = window.days[0] ?? window.now.day
    const last = window.days[window.days.length - 1] ?? window.now.day

    // `CONSOLE_TIME_ZONE` is a module constant, never user input — the only
    // interpolated fragment here, and it keeps the zone at a single place.
    // Bounds are parameters, and both sides are closed: a clock skew ahead of
    // the window must not leak a "future" column into the grid.
    //
    // ⚠️ The `::timestamp` casts on the bounds are NOT decoration. `date AT TIME
    // ZONE …` leaves Postgres to choose between `timezone(text, timestamp)` and
    // `timezone(text, timestamptz)` — both reachable from `date` by an implicit
    // cast — and the two answer DIFFERENT questions. Saying `::timestamp` picks
    // the one that means "midnight of that calendar day, read in Paris".
    const sql = `
      SELECT
        to_char((r.created_at AT TIME ZONE '${CONSOLE_TIME_ZONE}')::date, 'YYYY-MM-DD')  AS "day",
        EXTRACT(HOUR FROM (r.created_at AT TIME ZONE '${CONSOLE_TIME_ZONE}'))::int       AS "hour",
        COUNT(*)::int                                                                    AS "count",
        COALESCE(array_agg(DISTINCT w.name) FILTER (WHERE w.name IS NOT NULL), ARRAY[]::text[]) AS "workspaces",
        COUNT(*) FILTER (WHERE w.name IS NULL)::int                                      AS "withoutWorkspace"
      FROM analysis_runs r
      LEFT JOIN workspaces w ON w.id = r.workspace_id
      WHERE r.created_at >= ($1::date)::timestamp AT TIME ZONE '${CONSOLE_TIME_ZONE}'
        AND r.created_at <  ($2::date + 1)::timestamp AT TIME ZONE '${CONSOLE_TIME_ZONE}'
      GROUP BY 1, 2
      ORDER BY 1, 2
    `

    let rows: Array<Record<string, unknown>>
    try {
      rows = (await this.dataSource.query(sql, [first, last])) as Array<Record<string, unknown>>
    } catch (error) {
      this.logger.error('getLaunchHeatmap error', { error, from: first, to: last })
      throw error
    }

    const buckets: AdminAnalysesHeatmapBucket[] = (rows ?? []).map(r => ({
      day: String(r['day'] ?? ''),
      hour: Math.trunc(num(r['hour']) ?? 0),
      count: Math.trunc(num(r['count']) ?? 0),
      workspaces: Array.isArray(r['workspaces'])
        ? (r['workspaces'] as unknown[]).filter((n): n is string => typeof n === 'string' && n.length > 0)
        : [],
      withoutWorkspace: Math.trunc(num(r['withoutWorkspace']) ?? 0),
    }))

    return {
      timeZone: CONSOLE_TIME_ZONE,
      days: window.days,
      now: window.now,
      buckets,
      total: buckets.reduce((sum, b) => sum + b.count, 0),
    }
  }

  private toRow(r: Record<string, unknown>): AdminAnalysisRow {
    return {
      accountId: String(r['accountId'] ?? ''),
      companyName: String(r['companyName'] ?? ''),
      siren: str(r['siren']),
      status: String(r['status'] ?? ''),
      commercialStatus: str(r['commercialStatus']),
      userId: String(r['userId'] ?? ''),
      email: str(r['email']),
      fullName: fullName(r['firstName'], r['lastName']),
      workspaceId: str(r['workspaceId']),
      workspaceName: str(r['workspaceName']),
      costUsd: num(r['costUsd']),
      priorityScore: num(r['priorityScore']),
      errorMessage: str(r['errorMessage']),
      createdAt: iso(r['createdAt']),
      updatedAt: iso(r['updatedAt']),
      phasesCompleted: Number(r['phasesCompleted'] ?? 0),
      lastPhase: str(r['lastPhase']),
      isZombie: r['isZombie'] === true,
    }
  }
}
