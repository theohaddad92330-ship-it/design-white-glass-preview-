import { InjectQueue } from '@nestjs/bullmq'
import { BadGatewayException, BadRequestException, Injectable, Logger } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { HttpError } from '@bellum/errors'
import { type Queue } from 'bullmq'
import { DataSource } from 'typeorm'
import {
  IaClient,
  type IaModelRoutingEntry,
  type IaPromptRegistryDiff,
  type IaPromptRegistryEntry,
  type IaRightsMatrixEntry,
} from '../ia/ia.client'
import {
  canGo,
  canGo2208,
  GO_2208_CONDITIONS,
  GO_CONDITIONS,
  METHOD_CORPUS_V1,
  NO_GO_2208_CONDITIONS,
  NO_GO_CONDITIONS,
  NONREGRESSION_CAPACITIES,
  redirectedRoutes,
  rollbackableRoutes,
  ROUTE_MIGRATION_COEXISTENCE,
  ROUTE_MIGRATION_METRICS,
  ROUTE_MIGRATION_REGISTRY,
  ROUTE_MIGRATION_ROLLBACK,
  routeMigrationMetricsCoverage,
  type Go2208Condition,
  type GoCondition,
  type NoGo2208Condition,
  type NoGoCondition,
  type NonRegressionCapacity,
  type RouteMigrationCoexistenceEntry,
  type RouteMigrationEntry,
  type RouteMigrationMetric,
  type RouteMigrationRollbackEntry,
} from '@bellum/contracts'

// In-file building blocks composed into the exported `AdminUsageReport` — not
// exported (knip flags type exports consumed only in their own file).

/** Cost + usage for one user, aggregated over every account they created. */
interface UsageByUser {
  userId: string
  email: string | null
  fullName: string | null
  totalAnalyses: number
  /** Analyses whose cost was never stamped — the totals below are a FLOOR. */
  unmeasuredAnalyses: number
  totalCost: number
  /** `null` = no analysis carried a cost. An average over nothing is not zero. */
  avgCost: number | null
  last30dCost: number
}

/** Cost + usage for one workspace (ESN team), aggregated over its accounts. */
interface UsageByWorkspace {
  workspaceId: string
  workspaceName: string | null
  totalAnalyses: number
  /** Analyses whose cost was never stamped — the totals below are a FLOOR. */
  unmeasuredAnalyses: number
  totalCost: number
  /** `null` = no analysis carried a cost. An average over nothing is not zero. */
  avgCost: number | null
  last30dCost: number
}

/** Platform-wide roll-up for the KPI cards. */
interface UsageTotals {
  totalAnalyses: number
  /** Analyses whose cost was never stamped — the totals below are a FLOOR. */
  unmeasuredAnalyses: number
  totalCost: number
  /** `null` = no analysis carried a cost. An average over nothing is not zero. */
  avgCost: number | null
  last30dCost: number
}

export interface AdminUsageReport {
  totals: UsageTotals
  byUser: UsageByUser[]
  byWorkspace: UsageByWorkspace[]
}

/** BullMQ depth snapshot for one queue. In-file only (composed into
 *  `AdminSystemHealth`) — knip flags lone type exports. */
interface QueueHealth {
  name: string
  waiting: number | null
  active: number | null
  completed: number | null
  failed: number | null
  delayed: number | null
  paused: number | null
}

/** Une migration déjà exécutée sur CETTE base, telle que `_migrations` la porte. */
interface AppliedMigration {
  name: string
  /** `null` = ligne présente mais horodatage illisible — jamais deviné. */
  appliedAt: string | null
}

export interface AdminMigrationsReport {
  /** Tout ce que CE build connaît (`dataSource.migrations`), exécuté ou non. */
  total: number
  /** Déjà exécutées, dans l'ordre `_migrations` (plus récente d'abord). */
  applied: AppliedMigration[]
  /** Connues du build mais absentes de `_migrations` : `migration:run` n'est pas encore passé dessus. */
  pending: string[]
}

/**
 * #2445.2 (épopée #2766) — la politique de routage modèle EFFECTIVE, par
 * capacité, telle que la console d'opérations la lit. `available: false` =
 * l'IA n'a pas répondu (timeout, service éteint) — jamais une politique
 * inventée pour combler le trou (CLAUDE rule : pas de donnée fictive).
 */
export interface AdminModelRoutingReport {
  available: boolean
  routes: IaModelRoutingEntry[]
}

/**
 * #2445.1 (épopée #2766) — la LISTE des prompts enregistrés avec leur
 * version, telle que la console d'opérations la lit. `available: false` =
 * l'IA n'a pas répondu — jamais une liste inventée pour combler le trou.
 * Diff contre une version antérieure et rollback restent hors de ce rapport
 * (aucune historisation des versions passées n'existe encore).
 */
export interface AdminPromptRegistryReport {
  available: boolean
  prompts: IaPromptRegistryEntry[]
}

/**
 * #2445.1 (épopée #2766) — DIFF d'un prompt entre deux refs git et commande
 * de ROLLBACK associée, la part restée hors de {@link AdminPromptRegistryReport}.
 * `available: false` = l'IA n'a pas répondu — jamais un diff inventé.
 */
export interface AdminPromptRegistryDiffReport {
  available: boolean
  diff: string
  rollbackCommand: string[]
}

/**
 * #2445.4 (épopée #2766) — la matrice des droits de Laura, PAR OUTIL, telle
 * que la console d'opérations la lit. `available: false` = l'IA n'a pas
 * répondu — jamais une matrice inventée pour combler le trou.
 */
export interface AdminRightsMatrixReport {
  available: boolean
  tools: IaRightsMatrixEntry[]
}

/**
 * #3274.5 (épopée #3274) — une ligne de gouvernance du corpus méthode : d'où
 * elle vient (`packages/contracts/src/schemas/method-corpus.ts`, GA-26, la
 * fondation de BEL-SC-221), telle quelle. `wiredAtRuntime` croise la SEULE
 * information que `apps/ia` peut affirmer sur elle-même : cet identifiant
 * est-il parmi ceux que `method_corpus_governance.is_rule_active` consulte
 * RÉELLEMENT au retrieval (#3274.3) ? `null` quand l'IA n'a pas répondu —
 * jamais un booléen deviné.
 */
interface AdminMethodCorpusGovernanceEntry {
  ruleId: string
  title: string
  category: string
  owner: string
  enabled: boolean
  disabledReason: string | null
  featureFlagKey: string | null
  comparisonToProductRules: string
  impactMetricKey: string | null
  introducedOrRevisedInVersion: string
  wiredAtRuntime: boolean | null
}

/** #3274.5 — un jalon du changelog du corpus (`METHOD_CORPUS_V1.change_log`),
 *  l'« historique de version » nommé par l'épopée : ce que le dépôt peut
 *  réellement montrer, pas un journal de bascules qui n'existe nulle part. */
interface AdminMethodCorpusChangeLogEntry {
  version: string
  releasedAt: string
  summary: string
  ruleIds: string[]
  comparisonNote: string | null
}

/**
 * #3274.5 (épopée #3274) — la gouvernance du corpus méthode, telle que la
 * console d'opérations la lit : LECTURE seule (désactiver une règle en
 * production reste un commit sur `method-corpus.ts`, pas un geste d'écran —
 * même prudence que {@link AdminPromptRegistryReport} sur le rollback de
 * prompt). `runtimeCrossCheckAvailable: false` = l'IA n'a pas répondu ; les
 * lignes restent quand même rendues (elles vivent en git, pas sur l'IA),
 * seul `wiredAtRuntime` retombe à `null` sur chacune.
 */
export interface AdminMethodCorpusGovernanceReport {
  corpusVersion: string
  releasedAt: string
  runtimeCrossCheckAvailable: boolean
  rules: AdminMethodCorpusGovernanceEntry[]
  changeLog: AdminMethodCorpusChangeLogEntry[]
}

/**
 * #2958 — LE PREMIER APPELANT du registre de migration de routes (#2154.3) et
 * des conditions NO-GO/GO (#2154.31/.32) : les trois fichiers de
 * `@bellum/contracts` existaient déjà, testés, depuis le lot du 26/09 05:01
 * (`bf6b7a17`, `58fd01db1`), mais `git grep` ne trouvait aucun écran ni
 * endpoint qui les lisait — exactement le motif que
 * `agent_docs/chantiers-livres.md` signale : « du code juste, calculé,
 * testé, que personne n'appelle ». Ce rapport ne recalcule rien, il compose
 * les exports déjà vérifiés pour la console d'opérations.
 */
export interface AdminRouteMigrationReport {
  registry: {
    /** Les quatorze routes nommées par #2154.4/.5 — pas « toutes les routes actuelles ». */
    total: number
    redirectedCount: number
    entries: readonly RouteMigrationEntry[]
  }
  goNoGo: {
    canGo: boolean
    noGo: readonly NoGoCondition[]
    go: readonly GoCondition[]
  }
  /** #2958.94-.112 — les conditions NO-GO/GO propres à #2208, vocabulaire
   *  distinct de #2154.31/.32, jamais fusionnées avec elles. */
  goNoGo2208: {
    canGo: boolean
    noGo: readonly NoGo2208Condition[]
    go: readonly Go2208Condition[]
  }
  /** #2154.7 — l'étape RÉELLEMENT atteinte par route, et combien peuvent être défaites. */
  rollback: {
    rollbackableCount: number
    entries: readonly RouteMigrationRollbackEntry[]
  }
  /** #2154.8 — combien de routes partagent VRAIMENT une page (vue), combien n'ont plus qu'une projection. */
  coexistence: {
    sharedViewCount: number
    entries: readonly RouteMigrationCoexistenceEntry[]
  }
  /** #2154.9/#2958.72-.93 — les treize dimensions, ENSEMBLE, pour la capacité de référence. */
  nonRegression: {
    capacities: readonly NonRegressionCapacity[]
  }
  /** #2958.72-.93 — les neuf métriques, une par émetteur du traceur produit,
   *  agrégées par route/écran, jamais par personne. */
  metrics: {
    instrumentedCount: number
    entries: readonly RouteMigrationMetric[]
  }
}

export interface AdminSystemHealth {
  /** Aggregate verdict — `degraded` trips the red pill on the health screen. */
  status: 'healthy' | 'degraded'
  queues: QueueHealth[]
  /** Analysis failure rate over the trailing window (rate ∈ [0,1]). */
  failures: { windowHours: number; total: number; failed: number; failureRate: number | null }
  /** Deployed build identity (same source as `GET /version`). */
  version: { commit: string; environment: string }
  uptimeSeconds: number
  timestamp: string
}

// Cap the top-N users/workspaces so the endpoint never dumps the whole tenant
// base — the screen shows the biggest spenders, which is what an operator needs.
const TOP_LIMIT = 50
// A run failure rate at or above this (over a meaningful sample) reads as degraded.
const FAILURE_RATE_ALERT = 0.2
// Below this many runs in the window, a spiky rate (e.g. 1/1 = 100 %) is noise.
const FAILURE_MIN_SAMPLE = 5
// A very deep analysis backlog (waiting + active) is degraded on its own — the
// pipeline is falling behind even if nothing has failed yet.
const ANALYSIS_BACKLOG_ALERT = 100

// ── Raw SQL (cross-tenant: NO user_id scope — operator sees every row) ─────────
// Cost is the USD figure the worker accumulates onto `accounts.api_cost_euros`
// (Anthropic bills USD; the `_euros` name is legacy). `last30dCost` filters on
// `updated_at`, i.e. when the run last stamped its cost, not account creation.
//
// ⚠️ « LE ZÉRO EST UN TROU, PAS UN FAIT » — corrigé le 29/08/2026.
// `api_cost_euros` est NULLABLE : une analyse jouée avant la comptabilité de
// coût, un run interrompu avant l'estampille, un compte importé n'ont AUCUN
// coût enregistré. Ce n'est pas un coût de zéro, c'est une absence de mesure.
//   · `COALESCE(AVG(...), 0)` annonçait « 0,0000 $ de coût moyen par analyse »
//     à un opérateur dont RIEN n'avait été tarifé. Une moyenne sur zéro valeur
//     n'est pas nulle : elle n'existe pas. On rend donc `NULL`, l'écran dit « — ».
//   · `COALESCE(SUM(...), 0)` reste — mais accompagné, dans la MÊME requête, du
//     compte des lignes qu'il n'a pas pu mesurer. C'est la règle déjà tenue par
//     `provider_costs` (`COUNT(*) FILTER (WHERE cost_usd IS NULL)`), qui vaut
//     ici aussi : un total qui laisse des lignes de côté est un PLANCHER, et il
//     n'a le droit d'être affiché que s'il le dit. Garde GA-64.

const USER_USAGE_SQL = `
  SELECT
    a.user_id                                                                              AS "userId",
    p.email                                                                                AS "email",
    p.first_name                                                                           AS "firstName",
    p.last_name                                                                            AS "lastName",
    COUNT(*)::int                                                                          AS "totalAnalyses",
    COUNT(*) FILTER (WHERE a.api_cost_euros IS NULL)::int                                  AS "unmeasuredAnalyses",
    COALESCE(SUM(a.api_cost_euros), 0)::float8                                             AS "totalCost",
    AVG(a.api_cost_euros)::float8                                                          AS "avgCost",
    COALESCE(SUM(a.api_cost_euros) FILTER (WHERE a.updated_at >= now() - interval '30 days'), 0)::float8 AS "last30dCost"
  FROM accounts a
  LEFT JOIN profiles p ON p.user_id = a.user_id
  GROUP BY a.user_id, p.email, p.first_name, p.last_name
  ORDER BY "totalCost" DESC, "totalAnalyses" DESC
  LIMIT $1
`

const WORKSPACE_USAGE_SQL = `
  SELECT
    a.workspace_id                                                                         AS "workspaceId",
    w.name                                                                                 AS "workspaceName",
    COUNT(*)::int                                                                          AS "totalAnalyses",
    COUNT(*) FILTER (WHERE a.api_cost_euros IS NULL)::int                                  AS "unmeasuredAnalyses",
    COALESCE(SUM(a.api_cost_euros), 0)::float8                                             AS "totalCost",
    AVG(a.api_cost_euros)::float8                                                          AS "avgCost",
    COALESCE(SUM(a.api_cost_euros) FILTER (WHERE a.updated_at >= now() - interval '30 days'), 0)::float8 AS "last30dCost"
  FROM accounts a
  LEFT JOIN workspaces w ON w.id = a.workspace_id
  WHERE a.workspace_id IS NOT NULL
  GROUP BY a.workspace_id, w.name
  ORDER BY "totalCost" DESC, "totalAnalyses" DESC
  LIMIT $1
`

const TOTALS_SQL = `
  SELECT
    COUNT(*)::int                                                                          AS "totalAnalyses",
    COUNT(*) FILTER (WHERE api_cost_euros IS NULL)::int                                    AS "unmeasuredAnalyses",
    COALESCE(SUM(api_cost_euros), 0)::float8                                               AS "totalCost",
    AVG(api_cost_euros)::float8                                                            AS "avgCost",
    COALESCE(SUM(api_cost_euros) FILTER (WHERE updated_at >= now() - interval '30 days'), 0)::float8 AS "last30dCost"
  FROM accounts
`

// Failure rate over the trailing 24h from the append-only run log. The run
// vocabulary uses 'error' for a failed run; 'failed' is matched too so the
// signal survives any status-vocabulary drift.
const FAILURE_SQL = `
  SELECT
    COUNT(*)::int                                                     AS "total",
    COUNT(*) FILTER (WHERE status IN ('error', 'failed'))::int        AS "failed"
  FROM analysis_runs
  WHERE created_at >= now() - interval '24 hours'
`

// `_migrations` est le nom de table choisi dans `data-source.ts` /
// `database.module.ts` (`migrationsTableName`) — celui que TypeORM crée et
// alimente lui-même à chaque `migration:run`, jamais écrit par autre chose.
const APPLIED_MIGRATIONS_SQL = `SELECT name, timestamp FROM _migrations ORDER BY timestamp DESC`

/** Un horodatage `_migrations` (ms epoch, en `bigint` donc en chaîne côté pg)
 *  en ISO — ou `null` s'il n'est pas lisible. Jamais deviné : même refus que
 *  `AdminWeeklyDigestSweepService.columnAddedAt`. */
function migrationTimestampToIso(raw: unknown): string | null {
  const ms = typeof raw === 'string' ? Number(raw) : typeof raw === 'number' ? raw : NaN
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null
}

/** A finite number, or 0 — pg returns numeric/float8 as strings. */
function num(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/**
 * A finite number, or `null` — for a value whose ABSENCE is meaningful.
 *
 * `num()` above coerces to 0, ce qui est juste pour un COMPTE (zéro analyse est
 * un fait) et faux pour une MOYENNE (une moyenne sur zéro valeur n'existe pas).
 * ⚠️ `Number(null)` vaut `0` et `Number.isFinite(0)` vaut `true` : sans le test
 * de nullité en premier, ce garde-fou serait inerte — le `NULL` de SQL
 * ressortirait en `0` exactement comme avant.
 */
function numOrNull(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** `first last`, trimmed, or `null` when neither is set. */
function buildFullName(first: unknown, last: unknown): string | null {
  const full = [first, last]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .join(' ')
    .trim()
  return full.length > 0 ? full : null
}

function resolveVersion(): { commit: string; environment: string } {
  return {
    commit:
      process.env['SENTRY_RELEASE'] ?? process.env['RAILWAY_GIT_COMMIT_SHA'] ?? process.env['GIT_COMMIT'] ?? 'unknown',
    environment: process.env['SENTRY_ENVIRONMENT'] ?? process.env['NODE_ENV'] ?? 'unknown',
  }
}

/** Map a BullMQ `getJobCounts()` bag to the compact {@link QueueHealth} shape. */
function toQueueHealth(name: string, counts: Record<string, number> | undefined): QueueHealth {
  const c = counts ?? {}
  return {
    name,
    waiting: numOrNull(c['waiting']),
    active: numOrNull(c['active']),
    completed: numOrNull(c['completed']),
    failed: numOrNull(c['failed']),
    delayed: numOrNull(c['delayed']),
    paused: numOrNull(c['paused']),
  }
}

/**
 * Operator observability queries for the `dashboard-manager` backoffice. Two
 * cross-tenant surfaces:
 *  - {@link getUsage} — cost + usage per user / per workspace (raw SQL);
 *  - {@link getHealth} — BullMQ queue depths + 24h run failure rate + build id.
 *
 * Intentionally NOT user-scoped — the platform operator (behind
 * `InternalSecretGuard`, header secret, no end-user JWT) sees every user,
 * workspace and account. It must never be reachable without that guard.
 */
@Injectable()
export class AdminOpsService {
  private readonly logger = new Logger(AdminOpsService.name)

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectQueue('analysis') private readonly analysisQueue: Queue,
    @InjectQueue('mailer') private readonly mailerQueue: Queue,
    private readonly ia: IaClient,
  ) {}

  async getUsage(): Promise<AdminUsageReport> {
    const [totalsRows, userRows, workspaceRows] = await Promise.all([
      this.dataSource.query(TOTALS_SQL) as Promise<Array<Record<string, unknown>>>,
      this.dataSource.query(USER_USAGE_SQL, [TOP_LIMIT]) as Promise<Array<Record<string, unknown>>>,
      this.dataSource.query(WORKSPACE_USAGE_SQL, [TOP_LIMIT]) as Promise<Array<Record<string, unknown>>>,
    ])

    const totalsRow = totalsRows?.[0] ?? {}
    return {
      totals: {
        totalAnalyses: num(totalsRow['totalAnalyses']),
        unmeasuredAnalyses: num(totalsRow['unmeasuredAnalyses']),
        totalCost: num(totalsRow['totalCost']),
        avgCost: numOrNull(totalsRow['avgCost']),
        last30dCost: num(totalsRow['last30dCost']),
      },
      byUser: (userRows ?? []).map(row => ({
        userId: String(row['userId'] ?? ''),
        email: (row['email'] as string | null) ?? null,
        fullName: buildFullName(row['firstName'], row['lastName']),
        totalAnalyses: num(row['totalAnalyses']),
        unmeasuredAnalyses: num(row['unmeasuredAnalyses']),
        totalCost: num(row['totalCost']),
        avgCost: numOrNull(row['avgCost']),
        last30dCost: num(row['last30dCost']),
      })),
      byWorkspace: (workspaceRows ?? []).map(row => ({
        workspaceId: String(row['workspaceId'] ?? ''),
        workspaceName: (row['workspaceName'] as string | null) ?? null,
        totalAnalyses: num(row['totalAnalyses']),
        unmeasuredAnalyses: num(row['unmeasuredAnalyses']),
        totalCost: num(row['totalCost']),
        avgCost: numOrNull(row['avgCost']),
        last30dCost: num(row['last30dCost']),
      })),
    }
  }

  async getHealth(): Promise<AdminSystemHealth> {
    const [analysisCounts, mailerCounts, failureRows] = await Promise.all([
      this.analysisQueue.getJobCounts(),
      this.mailerQueue.getJobCounts(),
      this.dataSource.query(FAILURE_SQL) as Promise<Array<Record<string, unknown>>>,
    ])

    const queues = [toQueueHealth('analysis', analysisCounts), toQueueHealth('mailer', mailerCounts)]

    const failureRow = failureRows?.[0] ?? {}
    const total = num(failureRow['total'])
    const failed = num(failureRow['failed'])
    const failureRate = total > 0 ? failed / total : null

    const analysisBacklog = (queues[0]!.waiting ?? 0) + (queues[0]!.active ?? 0)
    const degraded =
      (failureRate !== null && total >= FAILURE_MIN_SAMPLE && failureRate >= FAILURE_RATE_ALERT) ||
      analysisBacklog >= ANALYSIS_BACKLOG_ALERT

    return {
      status: degraded ? 'degraded' : 'healthy',
      queues,
      failures: { windowHours: 24, total, failed, failureRate },
      version: resolveVersion(),
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    }
  }

  /**
   * #2445.11 — statut des migrations pour la console d'opérations : ce qui a
   * réellement tourné sur CETTE base (`_migrations`) contre ce que CE build
   * connaît (`dataSource.migrations`, chargé depuis le même glob que
   * `migration:run`). Un nom connu du build et absent de `_migrations` est EN
   * ATTENTE — le déploiement est passé, `migration:run` pas encore.
   *
   * Lecture seule : aucune preview de lignes, aucun rollback, aucun backfill
   * depuis cet endpoint — ces gestes touchent la production et restent au
   * script `migrate-with-lock.mjs` + `migration:run`/`migration:revert` en
   * CLI (droit + audit, jamais un clic navigateur).
   */
  async getMigrations(): Promise<AdminMigrationsReport> {
    const rows = (await this.dataSource.query(APPLIED_MIGRATIONS_SQL)) as Array<{
      name: string
      timestamp: unknown
    }>

    const applied: AppliedMigration[] = rows.map(row => ({
      name: row.name,
      appliedAt: migrationTimestampToIso(row.timestamp),
    }))
    const appliedNames = new Set(applied.map(row => row.name))

    const knownNames = this.dataSource.migrations
      .map(migration => migration.name)
      .filter((name): name is string => typeof name === 'string' && name.length > 0)

    return {
      total: knownNames.length,
      applied,
      pending: knownNames.filter(name => !appliedNames.has(name)),
    }
  }

  /**
   * #2445.2 (épopée #2766) — la politique de routage modèle par capacité,
   * lue en direct sur l'IA (`GET /config/model-routing`) : c'est là que vit
   * le réglage (GA-26), cet endpoint ne fait que le RENDRE à la console.
   * Best-effort comme {@link ToolRegistryService.loadIaProviders} : sur tout
   * échec, `available: false` plutôt qu'une politique inventée.
   */
  async getModelRouting(): Promise<AdminModelRoutingReport> {
    try {
      const { routes } = await this.ia.modelRoutingPolicy()
      return { available: true, routes }
    } catch (error) {
      this.logger.warn(`getModelRouting: IA injoignable — ${error instanceof Error ? error.message : String(error)}`)
      return { available: false, routes: [] }
    }
  }

  /**
   * #2975 / #2440.82 — pose ou corrige la déclaration qu'UNE destination de
   * routage a été réévaluée. Contrairement à {@link getModelRouting}
   * (best-effort, lecture), une ÉCRITURE qui échoue doit se voir : une panne
   * de validation (clé/auteur manquant, 400 côté IA) remonte en
   * `BadRequestException`, une IA injoignable en `BadGatewayException` —
   * jamais un `{ ok: true }` silencieux qui laisserait croire que la
   * déclaration a pris alors qu'elle n'a pas pu s'écrire.
   */
  async declareModelRoutingEval(
    destinationKey: string,
    declaredBy: string,
    note: string | null,
  ): Promise<{ ok: boolean }> {
    try {
      return await this.ia.declareModelRoutingEval(destinationKey, declaredBy, note)
    } catch (error) {
      if (error instanceof HttpError && error.status === 400) {
        throw new BadRequestException(error.body || 'Déclaration invalide.')
      }
      this.logger.warn(
        `declareModelRoutingEval: IA injoignable — ${error instanceof Error ? error.message : String(error)}`,
      )
      throw new BadGatewayException('IA injoignable — la déclaration n’a pas pu s’écrire.')
    }
  }

  /**
   * #2445.1 (épopée #2766) — le registre de prompts, lu en direct sur l'IA
   * (`GET /config/prompt-registry`) : c'est là que vit le registre (GA-26),
   * cet endpoint ne fait que le RENDRE à la console. Best-effort comme
   * {@link getModelRouting} : sur tout échec, `available: false` plutôt
   * qu'une liste inventée.
   */
  async getPromptRegistry(): Promise<AdminPromptRegistryReport> {
    try {
      const { prompts } = await this.ia.promptRegistry()
      return { available: true, prompts }
    } catch (error) {
      this.logger.warn(`getPromptRegistry: IA injoignable — ${error instanceof Error ? error.message : String(error)}`)
      return { available: false, prompts: [] }
    }
  }

  /**
   * #2445.1 (épopée #2766) — diff + commande de rollback d'un prompt entre
   * deux refs git, lus en direct sur l'IA (`GET /config/prompt-registry/{name}/diff`).
   * Best-effort comme {@link getPromptRegistry} : sur tout échec,
   * `available: false` plutôt qu'un diff inventé.
   */
  async getPromptRegistryDiff(name: string, refA: string, refB = 'HEAD'): Promise<AdminPromptRegistryDiffReport> {
    try {
      const { diff, rollbackCommand } = await this.ia.promptRegistryDiff(name, refA, refB)
      return { available: true, diff, rollbackCommand }
    } catch (error) {
      this.logger.warn(
        `getPromptRegistryDiff: IA injoignable — ${error instanceof Error ? error.message : String(error)}`,
      )
      return { available: false, diff: '', rollbackCommand: [] }
    }
  }

  /**
   * #2445.4 (épopée #2766) — la matrice des droits par outil, lue en direct
   * sur l'IA (`GET /config/rights-matrix`) : c'est là que vit le classement
   * (GA-26, déménagé hors de `tests/` ce lot), cet endpoint ne fait que le
   * RENDRE à la console. Best-effort comme {@link getModelRouting} : sur
   * tout échec, `available: false` plutôt qu'une matrice inventée.
   */
  async getRightsMatrix(): Promise<AdminRightsMatrixReport> {
    try {
      const { tools } = await this.ia.rightsMatrix()
      return { available: true, tools }
    } catch (error) {
      this.logger.warn(`getRightsMatrix: IA injoignable — ${error instanceof Error ? error.message : String(error)}`)
      return { available: false, tools: [] }
    }
  }

  /**
   * #3274.5 (épopée #3274) — voir {@link AdminMethodCorpusGovernanceReport}.
   * Les lignes viennent de `METHOD_CORPUS_V1` (`@bellum/contracts`, GA-26) —
   * jamais recalculées ici. Best-effort sur le SEUL point que l'IA peut
   * affirmer (quels identifiants elle consulte réellement) : sur échec,
   * `runtimeCrossCheckAvailable: false` et `wiredAtRuntime: null` sur chaque
   * ligne, jamais un booléen deviné.
   */
  async getMethodCorpusGovernance(): Promise<AdminMethodCorpusGovernanceReport> {
    let wiredRuleIds: Set<string> | null = null
    try {
      const { wiredRuleIds: ids } = await this.ia.methodCorpusGovernance()
      wiredRuleIds = new Set(ids)
    } catch (error) {
      this.logger.warn(
        `getMethodCorpusGovernance: IA injoignable — ${error instanceof Error ? error.message : String(error)}`,
      )
    }
    const ruleById = new Map(METHOD_CORPUS_V1.rules.map(rule => [rule.rule_id, rule]))
    return {
      corpusVersion: METHOD_CORPUS_V1.version,
      releasedAt: METHOD_CORPUS_V1.released_at,
      runtimeCrossCheckAvailable: wiredRuleIds !== null,
      rules: METHOD_CORPUS_V1.governance.map(entry => {
        const rule = ruleById.get(entry.rule_id)
        if (!rule) throw new Error(`gouvernance orpheline (aucune règle) : ${entry.rule_id}`)
        return {
          ruleId: entry.rule_id,
          title: rule.title,
          category: rule.category,
          owner: entry.owner,
          enabled: entry.enabled,
          disabledReason: entry.disabled_reason,
          featureFlagKey: entry.feature_flag_key,
          comparisonToProductRules: entry.comparison_to_product_rules,
          impactMetricKey: entry.impact_metric_key,
          introducedOrRevisedInVersion: rule.version,
          wiredAtRuntime: wiredRuleIds ? wiredRuleIds.has(entry.rule_id) : null,
        }
      }),
      changeLog: METHOD_CORPUS_V1.change_log.map(entry => ({
        version: entry.version,
        releasedAt: entry.released_at,
        summary: entry.summary,
        ruleIds: entry.rule_ids,
        comparisonNote: entry.comparison_note,
      })),
    }
  }

  /**
   * #2958 — voir {@link AdminRouteMigrationReport}. Aucun I/O : les sept
   * exports composés ici (registre, NO-GO/GO, rollback #2154.7, coexistence
   * #2154.8, non-régression #2154.9, métriques #2958.72-.93) sont des
   * tableaux statiques, déjà vérifiés contre le code réel par leurs
   * `.test.ts` respectifs dans `packages/contracts`.
   */
  getRouteMigration(): AdminRouteMigrationReport {
    return {
      registry: {
        total: ROUTE_MIGRATION_REGISTRY.length,
        redirectedCount: redirectedRoutes().length,
        entries: ROUTE_MIGRATION_REGISTRY,
      },
      goNoGo: {
        canGo: canGo(),
        noGo: NO_GO_CONDITIONS,
        go: GO_CONDITIONS,
      },
      goNoGo2208: {
        canGo: canGo2208(),
        noGo: NO_GO_2208_CONDITIONS,
        go: GO_2208_CONDITIONS,
      },
      rollback: {
        rollbackableCount: rollbackableRoutes().length,
        entries: ROUTE_MIGRATION_ROLLBACK,
      },
      coexistence: {
        // #4197 (L6) — le mode `vue_partagee` est retiré : Positionnements est une
        // route à part entière, plus aucune route ne partage une page par `?view=`.
        sharedViewCount: 0,
        entries: ROUTE_MIGRATION_COEXISTENCE,
      },
      nonRegression: {
        capacities: NONREGRESSION_CAPACITIES,
      },
      metrics: {
        instrumentedCount: routeMigrationMetricsCoverage().instrumented,
        entries: ROUTE_MIGRATION_METRICS,
      },
    }
  }
}
