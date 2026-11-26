import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common'
import type { EventEmitter } from 'node:events'
import { DataSource } from 'typeorm'

/**
 * INC-04-10 — le chien de garde du pool Postgres.
 *
 * Le 04/10/2026 (09:27Z → 10:18Z), après un blip réseau, CHAQUE checkout du pool
 * échouait en « timeout exceeded when trying to connect » pendant 50 min alors
 * que la base était saine (8/60 connexions, connexion locale OK). Un simple
 * redémarrage du process a suffi. Ce service fait ce redémarrage lui-même :
 * quand toutes les tentatives échouent ainsi pendant ≥ 3 min d'affilée, SANS
 * une seule réussite entre, il journalise en ERREUR puis sort en code 1 — la
 * restart policy Railway (`ON_FAILURE`, apps/api/railway.json) relance le
 * service.
 *
 * Pourquoi 3 min : bien au-delà d'un ralentissement (un checkout attend
 * 10 s, `connectionTimeoutMillis`), bien en deçà des 50 min subies. Seule
 * l'erreur de CHECKOUT compte : une requête qui échoue (SQL, `query_timeout`)
 * ne dit rien d'un pool bloqué et ne démarre pas la série.
 */
export const POOL_STALL_EXIT_AFTER_MS = 3 * 60_000
const PROBE_INTERVAL_MS = 30_000
const CHECKOUT_TIMEOUT_MESSAGE = 'timeout exceeded when trying to connect'

/** #4616.2 — la part du plafond tenue (hors connexions libres) à partir de laquelle le pool se journalise. */
const POOL_PRESSURE_HELD_RATIO = 0.8

function isUnderPressure(pool: unknown): boolean {
  const p = pool as { totalCount?: unknown; idleCount?: unknown; waitingCount?: unknown; options?: { max?: unknown } }
  const { totalCount, idleCount, waitingCount } = p ?? {}
  if (typeof totalCount !== 'number' || typeof idleCount !== 'number' || typeof waitingCount !== 'number') return false
  if (waitingCount > 0) return true
  const max = p?.options?.max
  return typeof max === 'number' && max > 0 && totalCount - idleCount >= max * POOL_PRESSURE_HELD_RATIO
}

function isCheckoutTimeout(error: unknown): boolean {
  return error instanceof Error && error.message.includes(CHECKOUT_TIMEOUT_MESSAGE)
}

/** #4616 — au plus un état de pool par minute : une saturation qui dure ne noie pas le journal. */
const POOL_STATE_LOG_EVERY_MS = 60_000

/**
 * #4616 — l'état du pool, en une ligne : connexions tenues / plafond, libres, requêtes en file. Compteurs
 * seulement — jamais `options` entier (hôte, utilisateur, mot de passe). Illisible ⇒ on le dit, jamais « 0 ».
 */
export function describePoolState(pool: unknown): string {
  const p = pool as
    | { totalCount?: unknown; idleCount?: unknown; waitingCount?: unknown; options?: { max?: unknown } }
    | undefined
  const { totalCount, idleCount, waitingCount } = p ?? {}
  if (typeof totalCount !== 'number' || typeof idleCount !== 'number' || typeof waitingCount !== 'number') {
    return 'pool illisible'
  }
  const max = typeof p?.options?.max === 'number' ? p.options.max : '?'
  return `pool ${totalCount}/${max} connexions, ${idleCount} libres, ${waitingCount} en file`
}

/** Pure streak arithmetic — no timers, no I/O, so the spec can say NO. */
export class PgPoolStallTracker {
  private firstFailureAt: number | null = null

  /** Any successful checkout ends the streak. */
  recordSuccess(): void {
    this.firstFailureAt = null
  }

  /** Returns true when the process should be restarted. */
  recordFailure(error: unknown, now: number): boolean {
    if (!isCheckoutTimeout(error)) return false
    if (this.firstFailureAt === null) {
      this.firstFailureAt = now
      return false
    }
    return now - this.firstFailureAt >= POOL_STALL_EXIT_AFTER_MS
  }

  /** Milliseconds since the streak began (0 when none). */
  streakMs(now: number): number {
    return this.firstFailureAt === null ? 0 : now - this.firstFailureAt
  }
}

@Injectable()
export class PgPoolWatchdogService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(PgPoolWatchdogService.name)
  private readonly tracker = new PgPoolStallTracker()
  private timer: NodeJS.Timeout | undefined
  private exiting = false
  private lastPoolStateLogAt = Number.NEGATIVE_INFINITY

  constructor(private readonly dataSource: DataSource) {}

  onApplicationBootstrap(): void {
    // Jamais en test : aucun process à relancer, aucun timer qui traîne.
    if (process.env['NODE_ENV'] === 'test') return
    this.attachPoolListeners()
    this.timer = setInterval(() => void this.tick(), PROBE_INTERVAL_MS)
    this.timer.unref()
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer)
  }

  /**
   * Every client handed out by the pool (real traffic, not just our probe) is
   * a success: a pool that serves anyone is not wedged.
   */
  attachPoolListeners(): void {
    const pool = (this.dataSource.driver as unknown as { master?: EventEmitter }).master
    pool?.on('acquire', () => this.tracker.recordSuccess())
  }

  /** One probe through the app's own pool — the same checkout every request makes. */
  async tick(): Promise<void> {
    if (this.exiting || !this.dataSource.isInitialized) return
    try {
      await this.dataSource.query('SELECT 1')
      this.tracker.recordSuccess()
      this.logPoolPressure()
    } catch (error) {
      this.logPoolState(error)
      if (!this.tracker.recordFailure(error, this.now())) return
      this.exiting = true
      this.logger.error(
        `Postgres pool wedged: every checkout timed out for ${Math.round(this.tracker.streakMs(this.now()) / 1000)}s ` +
          'with no success — exiting so Railway restarts the service (INC-04-10)',
      )
      this.exitProcess(1)
    }
  }

  /** #4616 — un checkout qui échoue dit l'état du pool (au plus une fois par minute). */
  private logPoolState(error: unknown): void {
    if (!isCheckoutTimeout(error)) return
    const now = this.now()
    if (now - this.lastPoolStateLogAt < POOL_STATE_LOG_EVERY_MS) return
    this.lastPoolStateLogAt = now
    const pool = (this.dataSource.driver as unknown as { master?: unknown }).master
    this.logger.warn(`Postgres checkout timeout — ${describePoolState(pool)}`)
  }

  /**
   * #4616.2 — l'état du pool AVANT la saturation : une ligne par minute (la même limite que le checkout qui échoue)
   * dès que des requêtes attendent ou que les connexions TENUES (hors libres) atteignent 80 % du plafond. Un pool au
   * repos ne dit rien ; un pool illisible non plus (jamais une charge devinée). Aucune hausse du plafond ici.
   */
  private logPoolPressure(): void {
    const pool = (this.dataSource.driver as unknown as { master?: unknown }).master
    if (!isUnderPressure(pool)) return
    const now = this.now()
    if (now - this.lastPoolStateLogAt < POOL_STATE_LOG_EVERY_MS) return
    this.lastPoolStateLogAt = now
    this.logger.warn(`Postgres pool sous charge — ${describePoolState(pool)}`)
  }

  protected now(): number {
    return Date.now()
  }

  protected exitProcess(code: number): void {
    process.exit(code)
  }
}
