import { AsyncLocalStorage } from 'async_hooks'
import type { RequestTiming } from '../perf/request-timing'

export interface CorrelationContext {
  correlationId: string
  requestPath?: string
  requestMethod?: string
  userId?: string
  /**
   * #2442.4 (épopée #2879) — l'instant où LA REQUÊTE est reçue, posé par
   * `correlationIdMiddleware` (le premier maillon Express, avant tout guard
   * Nest). C'est ce qui permet à `ChatTurnClock` de mesurer le span « auth » :
   * tout ce qui s'exécute entre la réception et l'entrée dans le contrôleur —
   * routage et guards compris. Absent hors d'une vraie requête HTTP (un appel
   * direct au contrôleur en test, par exemple) : l'étape reste alors non
   * mesurée plutôt que fausse.
   */
  receivedAt?: number
  /** Perf P1 — compteurs SQL / pool de la requête (voir `perf/request-timing.ts`). */
  timing?: RequestTiming
}

export const correlationStorage = new AsyncLocalStorage<CorrelationContext>()

export function getCorrelationId(): string | undefined {
  return correlationStorage.getStore()?.correlationId
}

export function getCorrelationContext(): CorrelationContext | undefined {
  return correlationStorage.getStore()
}

export const CORRELATION_ID_HEADER = 'x-correlation-id'
export const REQUEST_ID_HEADER = 'x-request-id'
