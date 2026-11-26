import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectDataSource } from '@nestjs/typeorm'
import IORedis from 'ioredis'
import { DataSource } from 'typeorm'
import { parseRedisUrl } from '../../config/redis-connection'

/**
 * One dependency's verdict on the public status page. `latencyMs` is the
 * round-trip of the probe (rounded), or `null` when it failed / timed out.
 * Deliberately NO error detail here: failure reasons can carry internal URLs
 * or driver internals — they go to the server logs, never to the payload.
 */
type ComponentReport = { status: ComponentState; latencyMs: number | null }

/**
 * L'état d'une dépendance.
 *
 * ⚠️ `degraded` a été AJOUTÉ le 29/08/2026, et il ne double pas `down` : il
 * nomme un cas que la binarité rendait invisible. « Dégradé » = le distant
 * RÉPOND et se sait diminué ; « en panne » = il ne répond pas. Les fusionner
 * perdrait la seule information qui dit s'il faut redéployer une config ou
 * réveiller un service.
 *
 * ⚠️ La page publique (`apps/website`) normalise ce qu'elle ne connaît pas en
 * `unknown` : un composant `degraded` s'y affiche donc « inconnu » tant que son
 * libellé n'y est pas ajouté. Le verdict d'ENSEMBLE, lui, connaît `degraded`
 * depuis le premier jour — et c'est celui qui s'affiche en gros.
 */
type ComponentState = 'operational' | 'degraded' | 'down'

/**
 * Public system status served by `GET /status` and consumed by the
 * bellum-ai.com/status page. Contract:
 * - `down`      = the database (the one critical dependency) is unreachable;
 * - `degraded`  = a non-critical component (Redis queue/realtime, IA engine) is down;
 * - `operational` otherwise.
 */
export type StatusReport = {
  status: 'operational' | 'degraded' | 'down'
  components: {
    /** The API itself: if this answer arrives, it is up — plus build identity. */
    api: { status: 'operational'; uptimeSeconds: number; commit: string }
    database: ComponentReport
    redis: ComponentReport
    ia_engine: ComponentReport
  }
  checkedAt: string
}

/**
 * Live dependency checks behind `GET /status` — know (and show) that something
 * is wrong before a customer reports it.
 *
 * Design constraints:
 * - Every probe runs in PARALLEL with a strict 2s budget (`Promise.race`), so
 *   the endpoint answers in ≤ ~2s even when a dependency hangs.
 * - Results are cached in memory for 15s: a public page polling every 30s (or
 *   a burst of curious visitors) can never fan out into a self-DoS of the
 *   database/Redis/IA service. Concurrent callers share one in-flight check.
 * - The payload carries zero sensitive data: component names, up/down, probe
 *   latency, process uptime and a short commit id (already public on
 *   `GET /version`). No dependency versions, no hosts, no error messages.
 */
@Injectable()
export class StatusService {
  private readonly logger = new Logger(StatusService.name)

  /** Per-probe budget. A dependency slower than this is DOWN for our users. */
  protected readonly checkTimeoutMs: number = 2_000

  /** How long one snapshot is served before re-probing. */
  protected readonly cacheTtlMs: number = 15_000

  private cached?: { report: StatusReport; at: number }
  private inFlight?: Promise<StatusReport>

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  /** Cached snapshot of the system status (fresh check at most every 15s). */
  async getStatus(): Promise<StatusReport> {
    if (this.cached && Date.now() - this.cached.at < this.cacheTtlMs) {
      return this.cached.report
    }
    this.inFlight ??= this.buildReport().finally(() => {
      this.inFlight = undefined
    })
    return this.inFlight
  }

  private async buildReport(): Promise<StatusReport> {
    const [database, redis, iaEngine] = await Promise.all([
      this.runProbe('database', () => this.probeDatabase()),
      this.runProbe('redis', () => this.probeRedis()),
      this.runProbe('ia_engine', () => this.probeIaEngine()),
    ])

    const report: StatusReport = {
      status: overallStatus(database, redis, iaEngine),
      components: {
        api: { status: 'operational', uptimeSeconds: Math.round(process.uptime()), commit: shortCommit() },
        database,
        redis,
        ia_engine: iaEngine,
      },
      checkedAt: new Date().toISOString(),
    }
    this.cached = { report, at: Date.now() }
    return report
  }

  /**
   * Race one probe against the strict per-check budget. Never throws.
   *
   * ⚠️ Une sonde peut rendre `'degraded'` : un distant qui RÉPOND en se disant
   * diminué n'est ni « en panne » ni « opérationnel », et la première version de
   * cette méthode ne pouvait dire que l'un des deux — un `void` ne porte pas de
   * nuance. C'est ce qui faisait compter `operational` un moteur d'IA qui
   * annonçait lui-même `{"status": "degraded"}`.
   */
  private async runProbe(name: string, probe: () => Promise<ComponentState | void>): Promise<ComponentReport> {
    const startedAt = Date.now()
    let timer: NodeJS.Timeout | undefined
    try {
      const outcome = await Promise.race([
        probe(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`probe timed out after ${this.checkTimeoutMs}ms`)),
            this.checkTimeoutMs,
          )
        }),
      ])
      return { status: outcome ?? 'operational', latencyMs: Date.now() - startedAt }
    } catch (error) {
      // Failure detail stays server-side; the payload only says "down".
      // Bounded chatter: the 15s cache means at most ~4 of these per minute.
      this.logger.warn(`Status probe '${name}' failed`, {
        error: error instanceof Error ? error.message : String(error),
      })
      return { status: 'down', latencyMs: null }
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  /** Postgres: the cheapest real round-trip through the shared pool. */
  protected async probeDatabase(): Promise<void> {
    await this.dataSource.query('SELECT 1')
  }

  /**
   * Redis: a fresh, single-shot connection per probe (≤ 1 every 15s thanks to
   * the cache). A dedicated client avoids poisoning the shared BullMQ /
   * throttler connections with reconnect state, and `retryStrategy: null`
   * makes a dead Redis fail this probe instead of retrying forever.
   */
  protected async probeRedis(): Promise<void> {
    const client = new IORedis({
      ...parseRedisUrl(),
      lazyConnect: true,
      connectTimeout: this.checkTimeoutMs,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null,
      enableOfflineQueue: false,
    })
    try {
      await client.connect()
      await client.ping()
    } finally {
      client.disconnect()
    }
  }

  /**
   * IA engine: its public `GET /health` (exempt from the internal-auth gate).
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI LE CORPS SE LIT, ET PAS SEULEMENT LE CODE HTTP
   * ─────────────────────────────────────────────────────────────────────────
   * `apps/ia/app/main.py` rend **200** avec `{"status": "degraded",
   * "missing_env": [...]}` quand une variable critique manque — délibérément :
   * « reste 200 même mal configuré (sinon Railway ne promeut jamais le
   * déploiement qui corrigerait la config), **mais DIT ce qui manque** ».
   *
   * Cette sonde ne lisait que `res.ok`. La moitié qui porte l'information était
   * jetée, et un moteur sans `SUPABASE_URL` — dont huit routeurs répondent 500
   * un par un — était compté `operational` sur la page d'état publique. Le
   * docstring Python nomme lui-même la conséquence : « C'est ce qui rend la
   * panne INVISIBLE — le produit a l'air debout. »
   *
   * Un `200` n'est pas « tout va bien » ; c'est « j'ai répondu ».
   *
   * ⚠️ `missing_env` NE remonte PAS dans la réponse : la page d'état est
   * publique, et nommer les variables absentes dirait à n'importe qui ce qu'il
   * manque à notre infrastructure. Le détail va au journal, comme les autres
   * échecs de sonde.
   */
  protected async probeIaEngine(): Promise<ComponentState | void> {
    const health = await this.fetchIaHealth()
    if (!health.ok) {
      throw new Error(`IA /health returned HTTP ${health.status}`)
    }
    // Un corps ILLISIBLE ne vaut pas « dégradé » : le seul fait dont on soit
    // sûr est qu'il a répondu. Inventer une panne ferait crier au loup toutes
    // les 15 secondes ; inventer une santé serait le défaut qu'on corrige.
    const declared = (health.body as { status?: unknown } | null)?.status
    return declared === 'degraded' ? 'degraded' : undefined
  }

  /** L'appel réseau, isolé pour qu'un test puisse rendre un CORPS et pas seulement un code. */
  protected async fetchIaHealth(): Promise<{ ok: boolean; status: number; body: unknown }> {
    const base = this.config.get<string>('iaServiceUrl', 'http://localhost:8000')
    const res = await fetch(new URL('/health', base), { signal: AbortSignal.timeout(this.checkTimeoutMs) })
    // Le corps ne se lit QUE si la réponse est bonne, et une lecture qui échoue
    // ne fait pas échouer la sonde : on saurait déjà qu'il a répondu.
    const body = res.ok ? await res.json().catch(() => null) : null
    return { ok: res.ok, status: res.status, body }
  }
}

/**
 * db down = the product is down; Redis/IA down = degraded (analyses stall but
 * the app serves).
 *
 * ⚠️ Un composant qui se DIT dégradé compte comme dégradé. Sans cette ligne, le
 * verdict d'ensemble aurait continué d'annoncer « opérationnel » pendant qu'un
 * composant s'annonçait diminué juste en dessous — et c'est le verdict
 * d'ensemble que la page d'état affiche en gros.
 */
function overallStatus(
  database: ComponentReport,
  redis: ComponentReport,
  iaEngine: ComponentReport,
): StatusReport['status'] {
  if (database.status === 'down') return 'down'
  if (redis.status !== 'operational' || iaEngine.status !== 'operational') return 'degraded'
  return 'operational'
}

/** Short commit id — same sources as `GET /version`, truncated to 7 chars. */
function shortCommit(): string {
  const commit =
    process.env['SENTRY_RELEASE'] ?? process.env['RAILWAY_GIT_COMMIT_SHA'] ?? process.env['GIT_COMMIT'] ?? 'unknown'
  return commit === 'unknown' ? commit : commit.slice(0, 7)
}
