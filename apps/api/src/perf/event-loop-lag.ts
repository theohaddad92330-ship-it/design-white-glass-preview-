import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common'
import { monitorEventLoopDelay, type IntervalHistogram } from 'node:perf_hooks'

/**
 * Incident boucle API (05/10/2026) — un job d'import ZIP affamait la boucle
 * Node de l'API : `GET /version` à 2,3 s, toutes les routes en « timeout
 * exceeded when trying to connect » (pg-pool) — alors que Postgres était au
 * repos. Les journaux accusaient la base ; il manquait la seule mesure qui
 * aurait dit la vérité : le RETARD DE LA BOUCLE.
 *
 * Ce moniteur la prend en continu (`monitorEventLoopDelay`, résolution
 * 20 ms) et logge un WARN toutes les 30 s quand le p99 de la fenêtre dépasse
 * 200 ms. Il n'a AUCUN effet sur `/health/ready` : il nomme, il ne coupe pas.
 */
export const EVENT_LOOP_LAG_WARN_P99_MS = 200
const RESOLUTION_MS = 20
const REPORT_INTERVAL_MS = 30_000

/** Un histogramme par processus — partagé avec la ligne « slow request ». */
let shared: IntervalHistogram | null = null

function histogram(): IntervalHistogram {
  if (!shared) {
    shared = monitorEventLoopDelay({ resolution: RESOLUTION_MS })
    shared.enable()
  }
  return shared
}

/** Le p99 de la fenêtre courante, en ms — `null` tant que rien n'est mesuré. */
export function currentEventLoopLagP99Ms(): number | null {
  if (!shared || shared.count === 0) return null
  return shared.percentile(99) / 1e6
}

/** Le message à journaliser, ou `null` au seuil et en dessous. */
export function eventLoopLagWarning(
  p99Ms: number | null,
  thresholdMs: number = EVENT_LOOP_LAG_WARN_P99_MS,
): string | null {
  if (p99Ms === null || p99Ms <= thresholdMs) return null
  return `event loop lag p99=${Math.round(p99Ms)}ms (seuil ${thresholdMs}ms)`
}

@Injectable()
export class EventLoopLagMonitor implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('EventLoopLag')
  private timer: NodeJS.Timeout | null = null

  onApplicationBootstrap(): void {
    histogram()
    this.timer = setInterval(() => this.report(), REPORT_INTERVAL_MS)
    // Ne retient jamais le processus en vie à lui seul.
    this.timer.unref()
  }

  /** Une fenêtre : logge si besoin, puis repart de zéro. */
  report(p99Ms: number | null = currentEventLoopLagP99Ms()): void {
    const warning = eventLoopLagWarning(p99Ms)
    if (warning) this.logger.warn(warning)
    shared?.reset()
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    shared?.disable()
    shared = null
  }
}
