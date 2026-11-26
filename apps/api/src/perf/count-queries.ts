import { correlationStorage } from '../correlation-id/correlation-id.store'
import { createRequestTiming, getRequestTiming } from './request-timing'

/**
 * Utilitaire de test : `await countQueries(async () => …)` exécute `fn` sous un
 * contexte de requête neuf et rend `{ result, queries, dbMs, poolWaitMs }`.
 * Il compte ce que `instrumentPool` a vu (un vrai `pg.Pool` enveloppé, ou un
 * faux pool dans la spec) ; avec un repository simulé, le double appelle
 * `recordQuery()`. Garde type : `expect(queries).toBeLessThanOrEqual(N)`.
 */
export async function countQueries<T>(
  fn: () => Promise<T> | T,
): Promise<{ result: T; queries: number; dbMs: number; poolWaitMs: number }> {
  const timing = createRequestTiming()
  const result = await correlationStorage.run({ correlationId: 'count-queries', timing }, fn)
  return { result, queries: timing.queryCount, dbMs: timing.dbMs, poolWaitMs: timing.poolWaitMs }
}

/** Pour un double de repository : compte UNE requête sous le contexte courant. */
export function recordQuery(): void {
  const timing = getRequestTiming()
  if (timing) timing.queryCount += 1
}
