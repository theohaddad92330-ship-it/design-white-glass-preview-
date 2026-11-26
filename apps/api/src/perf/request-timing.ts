import { performance } from 'perf_hooks'
import { getCorrelationContext } from '../correlation-id/correlation-id.store'

/**
 * Perf P1 (chantier « pages lentes » 29/09/2026) — ce que UNE requête HTTP a
 * coûté côté serveur : nombre de requêtes SQL, temps SQL cumulé, temps
 * d'attente d'une connexion du pool. Porté par le contexte de corrélation
 * existant (`correlationStorage`), donc visible de tout code sous la requête
 * sans second AsyncLocalStorage. Aucun texte SQL, aucune donnée : des compteurs.
 */
export interface RequestTiming {
  /** `performance.now()` à l'entrée de la requête. */
  startedAt: number
  queryCount: number
  dbMs: number
  poolWaitMs: number
}

export function createRequestTiming(): RequestTiming {
  return { startedAt: performance.now(), queryCount: 0, dbMs: 0, poolWaitMs: 0 }
}

export function getRequestTiming(): RequestTiming | undefined {
  return getCorrelationContext()?.timing
}

const round1 = (ms: number): number => Math.round(ms * 10) / 10

/** `Server-Timing` : `app;dur=…, db;dur=…;desc="N q", pool;dur=…` (ms). */
export function formatServerTiming(timing: RequestTiming, now: number = performance.now()): string {
  const total = round1(now - timing.startedAt)
  return [
    `app;dur=${total}`,
    `db;dur=${round1(timing.dbMs)};desc="${timing.queryCount} q"`,
    `pool;dur=${round1(timing.poolWaitMs)}`,
  ].join(', ')
}
