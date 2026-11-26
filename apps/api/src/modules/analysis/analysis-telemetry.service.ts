import { Injectable, Logger, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  angleThemeTokens,
  computeAngleMatchFromTokens,
  computeContactAccessibilityScore,
  computeContactBucket,
  computeContactPriorityReason,
  computeContactQualifStatus,
  computeContactRelevanceScore,
  computeContactScore,
  computeContactScoreBreakdown,
  computeHierarchyLevel,
  type ContactApolloDetails,
  type ContactScoreCriterion,
} from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { AnalysisRunEntity } from '../../database/entities/analysis-run.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { buildEntityScoreContext, contactSourceTag, lookupEntityZone } from './contact-score'

/** Grounding / sourcing KPI for one analysis — the IA v2 «citer ses sources»
 *  signal. Read deterministically from the research ``sources`` block
 *  (``apps/ia/app/services/sources.py``) + the computed ``confidence``, never
 *  from a fabricated number. The deck's target is «< 5 % de faits non sourcés»,
 *  surfaced as ``sourcedRatio`` so an operator sees, per analysis, how much of
 *  the dossier is backed by an official/citable source vs flagged as an AI
 *  hypothesis to confirm. In-file only (composed into the report/detail) — knip
 *  flags lone type exports. */
type GroundingKpi = {
  sourcedFacts: number // sources.coverage.public_facts — fields tagged PUBLIC
  hypothesisFacts: number // sources.coverage.hypothesis_facts — fields tagged HYPOTHÈSE
  factsWithSource: number // sources.coverage.facts_with_source
  factsWithEvidence: number // sources.coverage.facts_with_evidence (extract + date)
  registrySize: number // sources.coverage.registry_size — # verifiable sources consulted
  legalCitations: number // sources.coverage.legal_citations — hard registry citations
  // public / (public + hypothesis); null when the run tagged no facts either way.
  sourcedRatio: number | null
  confidenceScore: number | null // raw_analysis.confidence.score (0..100)
  confidenceTier: string | null // "low" | "medium" | "high"
}

// In-file building block only (composed into the exported report/detail). Not
// exported — knip flags type exports consumed only in their own file.
type TelemetryRow = {
  accountId: string
  companyName: string
  status: string
  costUsd: number | null
  priorityScore: number | null
  siren: string | null
  createdAt: Date
  updatedAt: Date
  /** Mesurée, ou `null` quand aucun run terminé ne permet de la connaître.
   *  Jamais estimée, jamais plafonnée. */
  durationMs: number | null
  // IA v2 grounding KPI (null for older runs with no sources/confidence block).
  grounding: GroundingKpi | null
}

/** Per-phase cost/time/token rollup across the returned analyses — the
 *  "where do the cost and the minutes go" breakdown for the monitoring home. */
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

/** Health rollup for an external source (Brave / Firecrawl / Pappers / Apollo /
 *  INSEE / Claude…) across the phases that reported it. */
type SourceHealth = {
  source: string
  ok: number
  degraded: number
}

/** Kind of provider limit detected from a failure message:
 *  - ``credit`` : billing / credit balance exhausted (Anthropic, Firecrawl…)
 *  - ``quota``  : plan / monthly-quota cap (Apollo People-Match, Firecrawl…)
 *  - ``rate``   : transient rate limit (429) — not an out-of-credit, but worth flagging.
 *  In-file only (re-declared on the dashboard side) — knip flags lone type exports. */
type CreditSignalKind = 'credit' | 'quota' | 'rate'

/** A provider limit detected from a real failed analysis' ``error_message``.
 *  Return type of ``detectCreditSignal`` — consumed only here (knip). */
type CreditSignal = {
  provider: string
  kind: CreditSignalKind
}

/** A surfaced credit/quota alert: a REAL failed analysis whose error message
 *  matched a known provider out-of-credit / quota / rate signal. */
type CreditAlert = {
  accountId: string
  companyName: string
  provider: string
  kind: CreditSignalKind
  message: string
  occurredAt: Date
}

/** Per-provider spend / attribution. ``costUsd`` is only known for the LLM
 *  (Claude/Anthropic, from token_usage); credit-based providers (Apollo,
 *  Firecrawl, Pappers, INSEE…) bill in opaque credits, so we surface the call
 *  attribution (``calls``) and mark ``metered: false`` — never an invented $. */
type ProviderSpend = {
  provider: string
  costUsd: number | null
  calls: number
  metered: boolean
}

/** Roll-up of the per-analysis grounding KPI across the returned analyses — the
 *  IA v2 sourcing quality at a glance. Only analyses that actually carry a
 *  ``sources``/``confidence`` block count toward it; the rest are honestly
 *  excluded (no fabricated 0). In-file only (composed into the report) — knip. */
type GroundingSummary = {
  analysesWithGrounding: number // # analyses carrying a grounding block
  avgSourcedRatio: number | null // mean sourced ratio over runs that have one
  avgConfidenceScore: number | null // mean confidence /100 over runs that have one
  totalRegistrySize: number // total verifiable sources consulted across analyses
  totalLegalCitations: number // total hard registry citations across analyses
  withSourcedRatio: number // # analyses that have a computable sourced ratio
  // # analyses meeting the deck target «< 5 % de faits non sourcés» (ratio ≥ 0.95).
  meetingTarget: number
}

export type TelemetryReport = {
  analyses: TelemetryRow[]
  summary: {
    count: number
    /** Somme des seules analyses chiffrées ; `null` si aucune ne l'est (jamais 0). */
    totalCostUsd: number | null
    /** Moyenne sur les seules analyses chiffrées ; `null` si aucune. */
    avgCostUsd: number | null
    /** Analyses SANS coût mesuré (exclues du total et de la moyenne). */
    unpricedCount: number
  }
  phaseAggregate: PhaseAggregate[]
  sourceHealth: SourceHealth[]
  creditAlerts: CreditAlert[]
  providerSpend: ProviderSpend[]
  groundingSummary: GroundingSummary
}

/** A surfaced contact for the "VALEUR" view — name, decision role (so the
 *  ≥1 IT decision-maker is visible), score, why, and one real outreach message.
 *  In-file only (composed into TelemetryDetail) — not exported (knip). */
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
  // Deterministic triage — computed here (title + role) so the front reads them
  // straight from the payload instead of re-deriving them.
  bucket: string
  hierarchyLevel: string
  // Contact target-strength score /100 + one-line reason (V1-vendable §7.7).
  contactScore: number
  // The explainable /100 breakdown (03_BUSINESS_RULES §3): one entry per criterion
  // with its points, its cap and a proof — « un score qui explique pourquoi » (Théo).
  scoreBreakdown: ContactScoreCriterion[]
  // S3b — the /100 roll-up split into two named axes: pertinence (bon profil ?)
  // + accessibilité (je peux l'atteindre ?).
  relevanceScore: number
  accessibilityScore: number
  priorityReason: string
  // S5 — qualification status (triage distinct du bucket rôle et du userStatus CRM).
  qualifStatus: string
  // Decider psychology (deck / ORION) — persisted for the top-N deciders; null
  // for the seeded tail.
  careerLevers: string[] | null
  implicitFears: string[] | null
}

const PHASE_ORDER = ['research', 'contacts', 'classify', 'plan']

function readPhases(r: AccountEntity): PhaseTelemetry[] {
  const phases = (r.raw_analysis as { phase_telemetry?: PhaseTelemetry[] } | null)?.phase_telemetry
  return Array.isArray(phases) ? phases : []
}

/** Nearest-rank percentile of an already-sorted ascending array. */
function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.ceil((p / 100) * sortedAsc.length) - 1))
  return sortedAsc[idx]
}

/** Roll up per-phase cost / latency (avg + p50 + p95) / tokens across analyses
 *  (from each account's ``raw_analysis.phase_telemetry``) — the breakdown the
 *  monitoring home shows so an operator sees where the cost and the minutes go. */
function aggregatePhases(rows: AccountEntity[]): PhaseAggregate[] {
  type Acc = { cost: number[]; dur: number[]; inTok: number[]; outTok: number[]; cacheR: number[]; cacheC: number[] }
  const acc = new Map<string, Acc>()
  for (const r of rows) {
    for (const p of readPhases(r)) {
      const name = String(p?.name ?? '')
      if (!name) continue
      const cur = acc.get(name) ?? { cost: [], dur: [], inTok: [], outTok: [], cacheR: [], cacheC: [] }
      cur.cost.push(Number(p.costUsd ?? 0))
      cur.dur.push(Number(p.durationMs ?? 0))
      cur.inTok.push(Number(p.inputTokens ?? 0))
      cur.outTok.push(Number(p.outputTokens ?? 0))
      cur.cacheR.push(Number(p.cacheReadTokens ?? 0))
      cur.cacheC.push(Number(p.cacheCreationTokens ?? 0))
      acc.set(name, cur)
    }
  }
  const sum = (xs: number[]): number => xs.reduce((s, x) => s + x, 0)
  const avg = (xs: number[]): number => (xs.length ? sum(xs) / xs.length : 0)
  const ordered = [...PHASE_ORDER.filter(n => acc.has(n)), ...[...acc.keys()].filter(n => !PHASE_ORDER.includes(n))]
  return ordered.map(name => {
    const a = acc.get(name) as Acc
    const durSorted = [...a.dur].sort((x, y) => x - y)
    return {
      name,
      runs: a.dur.length,
      avgCostUsd: avg(a.cost),
      totalCostUsd: sum(a.cost),
      avgDurationMs: avg(a.dur),
      p50DurationMs: percentile(durSorted, 50),
      p95DurationMs: percentile(durSorted, 95),
      avgInputTokens: avg(a.inTok),
      avgOutputTokens: avg(a.outTok),
      avgCacheReadTokens: avg(a.cacheR),
      avgCacheCreationTokens: avg(a.cacheC),
    }
  })
}

/** A finite number, or 0 (defensive against strings / nulls in the JSONB blob). */
function coverageNum(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/** Deck grounding target: at most 5 % of the facts may be non-sourced, i.e. the
 *  sourced ratio must be ≥ 0.95. */
const GROUNDING_SOURCED_TARGET = 0.95

/** Read the grounding / sourcing KPI from an account's ``raw_analysis``.
 *  Sources from the deterministic B3 ``sources.coverage`` block + the B4
 *  ``confidence``. Returns ``null`` when the run carries neither (older runs) —
 *  an honest empty state, never a fabricated number. */
function readGrounding(r: AccountEntity): GroundingKpi | null {
  const raw = r.raw_analysis as Record<string, unknown> | null
  if (!raw || typeof raw !== 'object') return null
  const sources = raw.sources
  const coverage = sources && typeof sources === 'object' ? (sources as { coverage?: unknown }).coverage : undefined
  const hasCoverage = coverage != null && typeof coverage === 'object'
  const confidence = raw.confidence
  const hasConfidence = confidence != null && typeof confidence === 'object'
  if (!hasCoverage && !hasConfidence) return null

  const cov = (hasCoverage ? coverage : {}) as Record<string, unknown>
  const sourcedFacts = coverageNum(cov.public_facts)
  const hypothesisFacts = coverageNum(cov.hypothesis_facts)
  const tagged = sourcedFacts + hypothesisFacts
  const conf = (hasConfidence ? confidence : {}) as { score?: unknown; tier?: unknown }
  return {
    sourcedFacts,
    hypothesisFacts,
    factsWithSource: coverageNum(cov.facts_with_source),
    factsWithEvidence: coverageNum(cov.facts_with_evidence),
    registrySize: coverageNum(cov.registry_size),
    legalCitations: coverageNum(cov.legal_citations),
    sourcedRatio: tagged > 0 ? sourcedFacts / tagged : null,
    confidenceScore: typeof conf.score === 'number' && Number.isFinite(conf.score) ? conf.score : null,
    confidenceTier: typeof conf.tier === 'string' ? conf.tier : null,
  }
}

/** Roll up the per-analysis grounding KPIs into the report summary. Only the
 *  analyses that actually carry a grounding block are passed in — the average /
 *  target counts never dilute over runs that have no sourcing data. */
function aggregateGrounding(groundings: GroundingKpi[]): GroundingSummary {
  const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null)
  const ratios = groundings.map(g => g.sourcedRatio).filter((v): v is number => v != null)
  const confs = groundings.map(g => g.confidenceScore).filter((v): v is number => v != null)
  return {
    analysesWithGrounding: groundings.length,
    avgSourcedRatio: mean(ratios),
    avgConfidenceScore: mean(confs),
    totalRegistrySize: groundings.reduce((s, g) => s + g.registrySize, 0),
    totalLegalCitations: groundings.reduce((s, g) => s + g.legalCitations, 0),
    withSourcedRatio: ratios.length,
    meetingTarget: ratios.filter(r => r >= GROUNDING_SOURCED_TARGET).length,
  }
}

const _HEALTHY = new Set(['ok', 'healthy', 'up', '200', 'success'])

/** Roll up external-source health (Brave / Firecrawl / Pappers / Apollo / INSEE /
 *  Claude…) across every phase that reported a ``source_health`` map. */
function aggregateSourceHealth(rows: AccountEntity[]): SourceHealth[] {
  const acc = new Map<string, { ok: number; degraded: number }>()
  for (const r of rows) {
    for (const p of readPhases(r)) {
      const sh = p.sourceHealth
      if (!sh || typeof sh !== 'object') continue
      for (const [source, status] of Object.entries(sh)) {
        const cur = acc.get(source) ?? { ok: 0, degraded: 0 }
        if (_HEALTHY.has(String(status).toLowerCase())) cur.ok += 1
        else cur.degraded += 1
        acc.set(source, cur)
      }
    }
  }
  return [...acc.entries()]
    .map(([source, c]) => ({ source, ...c }))
    .sort((a, b) => b.degraded - a.degraded || a.source.localeCompare(b.source))
}

/** Ordered table of known provider out-of-credit / quota / rate signals.
 *  Matched against an analysis' ``error_message`` (case-insensitive). Order
 *  matters: the most specific provider signal must win over the generic
 *  HTTP-code fallbacks at the end. */
const CREDIT_SIGNALS: Array<{ test: RegExp; provider: string; kind: CreditSignalKind }> = [
  // Anthropic / Claude — billing balance exhausted.
  { test: /credit balance is too low|credit balance too low/i, provider: 'anthropic', kind: 'credit' },
  { test: /\banthropic\b.*\b(billing|credit|quota)\b/i, provider: 'anthropic', kind: 'credit' },
  // Apollo — plan cap (People-Match / enrichment) or forbidden endpoint.
  { test: /people[-\s]?match.*(upgrade|plan)|upgrade.*people[-\s]?match/i, provider: 'apollo', kind: 'quota' },
  { test: /\bapollo\b.*\b(plan|upgrade|quota|forbidden|403)\b/i, provider: 'apollo', kind: 'quota' },
  // Firecrawl — out of scrape credits / monthly quota.
  { test: /\bfirecrawl\b.*\b(credit|quota|insufficient|exceeded)\b/i, provider: 'firecrawl', kind: 'credit' },
  // Pappers — credits / quota.
  { test: /\bpappers\b.*\b(credit|quota|crédit|jeton|exceeded|dépass)\b/i, provider: 'pappers', kind: 'quota' },
  // Generic HTTP signals (no provider name in the message).
  { test: /\b402\b|payment required/i, provider: 'inconnu', kind: 'credit' },
  { test: /\b429\b|too many requests|rate limit/i, provider: 'inconnu', kind: 'rate' },
  { test: /quota (exceeded|exhausted)|out of credit|insufficient credit/i, provider: 'inconnu', kind: 'quota' },
]

/**
 * Detect a provider out-of-credit / quota / rate signal in a failed analysis'
 * error message. Returns ``null`` when nothing matches — the alert must reflect
 * a REAL detected error, never a guess. Exported (+ unit-tested) so the
 * detection logic is a small, isolated building block.
 */
export function detectCreditSignal(errorMessage: string | null | undefined): CreditSignal | null {
  if (!errorMessage) return null
  for (const { test, provider, kind } of CREDIT_SIGNALS) {
    if (test.test(errorMessage)) return { provider, kind }
  }
  return null
}

/** Collect REAL credit/quota/rate alerts from failed analyses whose stored
 *  error message matched a known provider signal. Most recent first. */
function collectCreditAlerts(rows: AccountEntity[]): CreditAlert[] {
  const alerts: CreditAlert[] = []
  for (const r of rows) {
    const signal = detectCreditSignal(r.error_message)
    if (!signal) continue
    alerts.push({
      accountId: r.id,
      companyName: r.company_name ?? '',
      provider: signal.provider,
      kind: signal.kind,
      message: r.error_message ?? '',
      occurredAt: r.updated_at,
    })
  }
  return alerts.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
}

/** Approximate phase→providers map (clearly labelled "approximatif" in the UI):
 *  which external providers each pipeline phase calls. Drives the call-count
 *  attribution for the per-provider spend breakdown. */
const PHASE_PROVIDERS: Record<string, string[]> = {
  research: ['claude', 'brave', 'firecrawl', 'pappers'],
  contacts: ['apollo'],
  classify: ['claude'],
  plan: ['claude'],
}

/** ``claude`` / ``anthropic`` are the same metered LLM — normalise so its $ and
 *  call attribution don't split across two rows. */
function normaliseProvider(name: string): string {
  const n = name.toLowerCase()
  return n === 'anthropic' ? 'claude' : n
}

/** Providers we bill in USD (token cost is known). Everything else is credit-
 *  based with no per-call $ — attributed by call count, labelled "non chiffré". */
const METERED_PROVIDERS = new Set(['claude'])

/**
 * Per-provider spend / call attribution across the analyses.
 *
 * Claude/Anthropic $ is real (summed from the per-phase ``costUsd``). For the
 * credit-based providers we don't have a per-call price, so we surface the
 * number of phase-runs that called them (``calls``) and ``metered: false`` —
 * an APPROXIMATE attribution from the phase→provider map, never an invented $.
 */
function aggregateProviderSpend(rows: AccountEntity[]): ProviderSpend[] {
  const acc = new Map<string, { costUsd: number; calls: number }>()
  const bump = (provider: string, costUsd: number, calls: number): void => {
    const key = normaliseProvider(provider)
    const cur = acc.get(key) ?? { costUsd: 0, calls: 0 }
    cur.costUsd += costUsd
    cur.calls += calls
    acc.set(key, cur)
  }
  for (const r of rows) {
    for (const p of readPhases(r)) {
      const name = String(p?.name ?? '')
      if (!name) continue
      const providers = PHASE_PROVIDERS[name] ?? ['claude']
      // The phase's LLM cost is attributed to Claude; the other providers of
      // the phase get a call attribution only (credit-based, no per-call $).
      for (const provider of providers) {
        const isLlm = normaliseProvider(provider) === 'claude'
        bump(provider, isLlm ? Number(p.costUsd ?? 0) : 0, 1)
      }
    }
  }
  return [...acc.entries()]
    .map(([provider, c]) => {
      const metered = METERED_PROVIDERS.has(provider)
      return { provider, costUsd: metered ? c.costUsd : null, calls: c.calls, metered }
    })
    .sort((a, b) => (b.costUsd ?? -1) - (a.costUsd ?? -1) || b.calls - a.calls || a.provider.localeCompare(b.provider))
}

/** Per-phase audit record (cost / tokens / duration / source health), captured
 *  by the worker into raw_analysis.phase_telemetry. In-file only (knip). */
type PhaseTelemetry = {
  name: string
  costUsd: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheCreationTokens?: number
  durationMs: number
  sourceHealth?: Record<string, string>
}

export type TelemetryDetail = TelemetryRow & {
  priorityScore: number | null
  errorMessage: string | null
  rawAnalysis: Record<string, unknown> | null
  topContacts: TopContact[]
  phaseTelemetry: PhaseTelemetry[]
}

// The dashboard manager surfaces the FULL contact set (not a top-N teaser) so
// the operator can see every person Apollo found and build org charts. Capped
// only as a defensive ceiling — Phase 3 can't usefully classify beyond this.
const CONTACTS_CAP = 500

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

/**
 * Read-only telemetry over recent analyses for the monitoring dashboard.
 *
 * Intentionally NOT user-scoped — this is operator monitoring, exposed only
 * behind ``InternalSecretGuard`` (header secret, no end-user JWT). Cost is the
 * USD figure the worker accumulated onto ``api_cost_euros`` (see
 * ``AccountsService.setApiCost``).
 */
@Injectable()
export class AnalysisTelemetryService {
  private readonly logger = new Logger(AnalysisTelemetryService.name)

  constructor(
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(ContactEntity)
    private readonly contacts: Repository<ContactEntity>,
    // Real per-run timestamps. `@Optional()` so the direct-`new` specs keep
    // working; absent ⇒ every duration is reported UNKNOWN rather than
    // reconstructed from the account row (see `resolveRunDurations`).
    @Optional()
    @InjectRepository(AnalysisRunEntity)
    private readonly runs?: Repository<AnalysisRunEntity>,
  ) {}

  /**
   * Real wall-clock duration per account, from the run that actually produced
   * the dossier (`analysis_runs.completed_at − created_at`).
   *
   * This replaces `min(1h, accounts.updated_at − accounts.created_at)`, which
   * was wrong three times over:
   *  1. `accounts.updated_at` is an `@UpdateDateColumn` — it moves on EVERY
   *     write to the row (re-analysis, commercial status, a note), so the
   *     "duration" absorbed the account's entire editing lifetime, not its
   *     processing time.
   *  2. The 1h clamp was rendered AS a measurement. Any row long enough to hit
   *     it displayed exactly `60m 0s` — a cap presented as a fact.
   *  3. The cap (60 min) was three times `JOB_TIMEOUT_MS` (20 min), so every
   *     `60m 0s` was, by construction, a duration we did not know.
   *
   * Accounts with no completed run are absent from the map ⇒ `null` ⇒ the UI
   * shows "—" and the averages skip them, instead of a fabricated number
   * polluting the headline KPI.
   */
  private async resolveRunDurations(accountIds: string[]): Promise<ReadonlyMap<string, number>> {
    if (!this.runs || accountIds.length === 0) return new Map()
    try {
      // Latest COMPLETED run per account (DISTINCT ON = Postgres' first-row-per-group).
      const rows = await this.runs.query(
        `SELECT DISTINCT ON (account_id) account_id,
                EXTRACT(EPOCH FROM (completed_at - created_at)) * 1000 AS duration_ms
           FROM analysis_runs
          WHERE account_id = ANY($1)
            AND completed_at IS NOT NULL
            AND status = 'completed'
          ORDER BY account_id, created_at DESC`,
        [accountIds],
      )
      const out = new Map<string, number>()
      for (const row of rows as Array<{ account_id: string; duration_ms: string | number }>) {
        const ms = Number(row.duration_ms)
        // A negative or non-finite span is corrupt data, not a measurement.
        if (Number.isFinite(ms) && ms >= 0) out.set(row.account_id, Math.round(ms))
      }
      return out
    } catch (error) {
      this.logger.warn('Could not read run durations — reporting unknown rather than estimating', {
        error: error instanceof Error ? error.message : String(error),
      })
      return new Map()
    }
  }

  /** Every contact for an account, ranked by priority (best first), mapped to
   *  the surfaced ``TopContact`` shape with all known fields + one real outreach
   *  message each. The dashboard groups these by entity to draw an org chart. */
  private async getTopContacts(
    accountId: string,
    companyName = '',
    rawAnalysis: Record<string, unknown> | null = null,
  ): Promise<TopContact[]> {
    const rows = await this.contacts.find({
      where: { account_id: accountId },
      order: { priority: { direction: 'ASC', nulls: 'LAST' } },
      take: CONTACTS_CAP,
    })
    const entityContext = buildEntityScoreContext(rawAnalysis)
    // The recommended angles (from the strategy) — a contact whose title matches
    // an angle theme gets the fit-angle boost (Théo: "ce contact colle à l'angle
    // qu'on te conseille"). Read from the raw_analysis blob (title is stable).
    const angles = (Array.isArray(rawAnalysis?.angles) ? rawAnalysis.angles : []) as Array<{ title?: string | null }>
    // Build the angle theme-token union ONCE — it's identical for every contact.
    const themeTokens = angleThemeTokens(angles)
    return rows.map(c => {
      const raw = (c.raw_data ?? {}) as {
        photoUrl?: string
        city?: string
        country?: string
        apolloDetails?: ContactApolloDetails
      }
      const sourceTag = contactSourceTag(c.source, raw.apolloDetails, companyName, c.entity)
      // The contact inherits its entity's zone (S2 relevance + B.1 tier) so the
      // /100 score reflects WHERE the contact sits, not just their title. Match
      // is BU-drift tolerant (prefix), not exact-key — else "VINCI Energies
      // Digital" misses "VINCI Energies" and the proximité /20 flatlines (#19).
      const zone = lookupEntityZone(entityContext, c.entity)
      const scoreInput = {
        title: c.title,
        role: c.decision_role,
        email: c.email,
        emailVerified: c.email_verified,
        linkedinUrl: c.linkedin_url,
        source: c.source,
        entityRelevance: zone.relevance ?? null,
        perimeterTier: zone.perimeterTier ?? null,
        angleMatch: computeAngleMatchFromTokens({ title: c.title }, themeTokens),
        // Apollo employer mismatch = the contact LEFT the company → stale row.
        // Now on the score input (not just the qualif status) so it collapses
        // fraîcheur and drags down contactScore + accessibilité (#20).
        employerMismatch: sourceTag === 'RISQUE',
      }
      return {
        fullName: c.full_name,
        title: c.title,
        entity: c.entity,
        family: c.family,
        decisionRole: c.decision_role,
        priority: c.priority,
        whyContact: c.why_contact,
        profileSummary: c.profile_summary,
        email: c.email,
        emailVerified: c.email_verified,
        phone: c.phone,
        linkedinUrl: c.linkedin_url,
        photoUrl: raw.photoUrl ?? null,
        city: raw.city ?? null,
        country: raw.country ?? null,
        apolloDetails: raw.apolloDetails ?? null,
        // Best available real message: email body, else the LinkedIn message.
        message: c.email_message?.body ?? c.linkedin_message ?? null,
        userStatus: c.user_status,
        sourceTag,
        bucket: computeContactBucket({ title: c.title, role: c.decision_role }),
        hierarchyLevel: computeHierarchyLevel(c.title),
        contactScore: computeContactScore(scoreInput),
        // Explainable /100 breakdown (§3) — sums to contactScore, each criterion proven.
        scoreBreakdown: computeContactScoreBreakdown(scoreInput),
        // S3b — pertinence + accessibilité as two named /100 scores.
        relevanceScore: computeContactRelevanceScore(scoreInput),
        accessibilityScore: computeContactAccessibilityScore(scoreInput),
        priorityReason: computeContactPriorityReason(scoreInput),
        // S5 — qualification status. employerMismatch (RISQUE) is already on scoreInput.
        // entity feeds the "entité inconnue" bucket (Thales : 53 « entité non précisée »).
        qualifStatus: computeContactQualifStatus({ ...scoreInput, phone: c.phone, entity: c.entity }),
        careerLevers: c.career_levers ?? null,
        implicitFears: c.implicit_fears ?? null,
      }
    })
  }

  async getRecent(limit = DEFAULT_LIMIT): Promise<TelemetryReport> {
    const take = Math.min(Math.max(1, Math.floor(limit) || DEFAULT_LIMIT), MAX_LIMIT)
    const rows = await this.accounts.find({
      order: { updated_at: 'DESC' },
      take,
      select: [
        'id',
        'company_name',
        'status',
        'api_cost_euros',
        'created_at',
        'updated_at',
        'priority_score',
        'siren',
        'raw_analysis',
        'error_message',
      ],
    })

    const runDurations = await this.resolveRunDurations(rows.map(r => r.id))
    const analyses: TelemetryRow[] = rows.map(r => {
      const createdAt = r.created_at
      const updatedAt = r.updated_at
      return {
        accountId: r.id,
        companyName: r.company_name ?? '',
        status: r.status ?? 'unknown',
        costUsd: r.api_cost_euros != null ? Number(r.api_cost_euros) : null,
        priorityScore: r.priority_score ?? null,
        siren: r.siren ?? null,
        createdAt,
        updatedAt,
        // Measured, or absent. Never estimated. See `resolveRunDurations`.
        durationMs: runDurations.get(r.id) ?? null,
        grounding: readGrounding(r),
      }
    })

    // Supervision 30/09 : un coût absent n'est pas 0 $ — total = somme des seules
    // analyses chiffrées, moyenne sur ces seules analyses, le reste est compté.
    const priced = analyses.filter((a): a is TelemetryRow & { costUsd: number } => a.costUsd != null)
    const totalCostUsd = priced.length > 0 ? priced.reduce((sum, a) => sum + a.costUsd, 0) : null
    const groundings = analyses.map(a => a.grounding).filter((g): g is GroundingKpi => g != null)
    return {
      analyses,
      summary: {
        count: analyses.length,
        totalCostUsd,
        avgCostUsd: totalCostUsd !== null ? totalCostUsd / priced.length : null,
        unpricedCount: analyses.length - priced.length,
      },
      phaseAggregate: aggregatePhases(rows),
      sourceHealth: aggregateSourceHealth(rows),
      creditAlerts: collectCreditAlerts(rows),
      providerSpend: aggregateProviderSpend(rows),
      groundingSummary: aggregateGrounding(groundings),
    }
  }

  /** Full detail for one analysis — including the raw_analysis blob (the
   *  Phase-1 research: subsidiaries, entities, sites, programs, confidence…)
   *  the drill-down view renders. Null when the account doesn't exist. */
  async getDetail(accountId: string): Promise<TelemetryDetail | null> {
    const r = await this.accounts.findOne({
      where: { id: accountId },
      select: [
        'id',
        'company_name',
        'status',
        'api_cost_euros',
        'created_at',
        'updated_at',
        'priority_score',
        'siren',
        'raw_analysis',
        'error_message',
      ],
    })
    if (!r) return null
    return {
      accountId: r.id,
      companyName: r.company_name ?? '',
      status: r.status ?? 'unknown',
      costUsd: r.api_cost_euros != null ? Number(r.api_cost_euros) : null,
      siren: r.siren ?? null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      durationMs: (await this.resolveRunDurations([r.id])).get(r.id) ?? null,
      grounding: readGrounding(r),
      priorityScore: r.priority_score ?? null,
      errorMessage: r.error_message ?? null,
      rawAnalysis: (r.raw_analysis as Record<string, unknown> | null) ?? null,
      topContacts: await this.getTopContacts(
        accountId,
        r.company_name ?? '',
        r.raw_analysis as Record<string, unknown> | null,
      ),
      phaseTelemetry:
        ((r.raw_analysis as { phase_telemetry?: PhaseTelemetry[] } | null)?.phase_telemetry as
          | PhaseTelemetry[]
          | undefined) ?? [],
    }
  }
}
