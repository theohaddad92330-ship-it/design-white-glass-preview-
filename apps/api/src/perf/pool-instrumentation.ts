import { performance } from 'perf_hooks'
import { getRequestTiming, type RequestTiming } from './request-timing'

/**
 * Perf P1 — enveloppe d'un `pg.Pool` (celui que TypeORM tient dans
 * `dataSource.driver.master`) pour compter, PAR REQUÊTE HTTP, les requêtes SQL,
 * leur temps cumulé et l'attente d'une connexion. On agit au niveau du pilote :
 * repositories, QueryBuilder, `query()` bruts et transactions passent tous par
 * `client.query`, donc tous sont comptés (un logger TypeORM ne voit pas la durée).
 *
 * Le contexte (AsyncLocalStorage) est lu au moment de l'APPEL, pas dans le
 * callback de pg — celui-ci s'exécute dans le contexte de la socket, pas de la
 * requête. Hors requête HTTP : aucun effet, aucun coût.
 */

type AnyFn = (...args: unknown[]) => unknown

const PATCHED = Symbol.for('bellum.perf.patched')

/** Le cadrage de transaction n'est pas une requête métier : hors du compte. */
const TRANSACTION_FRAMING = /^\s*(START TRANSACTION|BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE SAVEPOINT)\b/i

function queryText(arg: unknown): string {
  if (typeof arg === 'string') return arg
  if (arg && typeof arg === 'object' && typeof (arg as { text?: unknown }).text === 'string') {
    return (arg as { text: string }).text
  }
  return ''
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return !!value && typeof (value as { then?: unknown }).then === 'function'
}

function patchClientQuery(client: Record<PropertyKey, unknown>): void {
  if (client[PATCHED]) return
  const original = client['query'] as AnyFn | undefined
  if (typeof original !== 'function') return
  client[PATCHED] = true

  client['query'] = function patchedQuery(this: unknown, ...args: unknown[]): unknown {
    const timing = getRequestTiming()
    if (!timing || TRANSACTION_FRAMING.test(queryText(args[0]))) return original.apply(this, args)

    timing.queryCount += 1
    const startedAt = performance.now()
    const done = (): void => {
      timing.dbMs += performance.now() - startedAt
    }

    const callbackIndex = args.findIndex(arg => typeof arg === 'function')
    if (callbackIndex !== -1) {
      const callback = args[callbackIndex] as AnyFn
      args[callbackIndex] = (...cbArgs: unknown[]): unknown => {
        done()
        return callback(...cbArgs)
      }
      return original.apply(this, args)
    }

    const result = original.apply(this, args)
    if (isThenable(result)) {
      result.then(done, done)
    }
    return result
  }
}

function recordWait(timing: RequestTiming | undefined, startedAt: number): void {
  if (timing) timing.poolWaitMs += performance.now() - startedAt
}

/** Idempotent : un pool déjà enveloppé ne l'est pas deux fois. */
export function instrumentPool(pool: object): void {
  const target = pool as Record<PropertyKey, unknown>
  if (target[PATCHED]) return
  const originalConnect = target['connect'] as AnyFn | undefined
  if (typeof originalConnect !== 'function') return
  target[PATCHED] = true

  target['connect'] = function patchedConnect(this: unknown, ...args: unknown[]): unknown {
    const timing = getRequestTiming()
    // Hors requête HTTP : rien à mesurer. Le client est (re)vérifié à chaque
    // emprunt SOUS requête, donc un client né dans un worker est enveloppé à temps.
    if (!timing) return originalConnect.apply(this, args)
    const startedAt = performance.now()

    const obtained = (client: unknown): void => {
      recordWait(timing, startedAt)
      if (client && typeof client === 'object') patchClientQuery(client as Record<PropertyKey, unknown>)
    }

    const callbackIndex = args.findIndex(arg => typeof arg === 'function')
    if (callbackIndex !== -1) {
      const callback = args[callbackIndex] as AnyFn
      args[callbackIndex] = (err: unknown, client: unknown, ...rest: unknown[]): unknown => {
        if (!err) obtained(client)
        else recordWait(timing, startedAt)
        return callback(err, client, ...rest)
      }
      return originalConnect.apply(this, args)
    }

    const result = originalConnect.apply(this, args)
    if (isThenable(result)) {
      return result.then(
        client => {
          obtained(client)
          return client
        },
        (error: unknown) => {
          recordWait(timing, startedAt)
          throw error
        },
      )
    }
    return result
  }
}
