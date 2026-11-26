import { AsyncLocalStorage } from 'async_hooks'
import type { NextFunction, Request, Response } from 'express'

/**
 * Perf P2 (29/09/2026) — mémo PAR REQUÊTE HTTP.
 *
 * `resolveActiveWorkspace` a ~750 appelants et un même endpoint le payait
 * plusieurs fois (le guard, puis le service, puis un helper), 1 à 3 requêtes
 * SQL en série à chaque fois, sur un pool de 10 connexions — une page lance
 * 10 à 41 appels simultanés. Le mémo rend ces lectures UNE fois par requête,
 * sans toucher la signature d'un seul appelant.
 *
 * Ce qui borne la sécurité :
 * - il ne vit que le temps de SA requête : une révocation (siège retiré, rôle
 *   baissé, espace supprimé) est effective dès la requête suivante — aucun
 *   cache inter-requêtes, aucun TTL à attendre ;
 * - il ne s'ouvre que pour une requête SÛRE (GET/HEAD) : une écriture peut
 *   changer l'appartenance au milieu de sa propre requête (accepter une
 *   invitation, retirer un membre puis relire) — elle relit tout, comme avant ;
 * - une requête longue (flux) relit au-delà de {@link REQUEST_MEMO_MAX_AGE_MS} ;
 * - un échec n'est jamais mémorisé ;
 * - hors requête HTTP (job BullMQ, cron) aucun mémo : chaque appel relit.
 *
 * La CLÉ est choisie par l'appelant et porte toujours l'utilisateur et/ou
 * l'espace concernés (jamais un jeton, jamais une PII).
 */
export const REQUEST_MEMO_MAX_AGE_MS = 10_000

interface MemoEntry {
  value: Promise<unknown>
  at: number
}

const memoStorage = new AsyncLocalStorage<Map<string, MemoEntry>>()

const SAFE_METHODS = new Set(['GET', 'HEAD'])

/** Exécute `fn` dans un mémo neuf (une « requête »). Sert aux tests et au middleware. */
export function runWithRequestMemo<T>(fn: () => T): T {
  return memoStorage.run(new Map(), fn)
}

/** Middleware Express : un mémo neuf par requête GET/HEAD, rien pour une écriture. */
export function requestMemoMiddleware(req: Request, _res: Response, next: NextFunction): void {
  if (!SAFE_METHODS.has(String(req.method).toUpperCase())) {
    // Une écriture sort explicitement de tout mémo englobant.
    memoStorage.exit(() => next())
    return
  }
  runWithRequestMemo(() => next())
}

/**
 * La valeur de `load()` mémorisée pour la requête courante sous `key`. Des
 * appelants simultanés partagent la MÊME promesse (une seule lecture).
 */
export function memoizeForRequest<T>(key: string, load: () => Promise<T>): Promise<T> {
  const memo = memoStorage.getStore()
  if (!memo) return load()
  const now = Date.now()
  const hit = memo.get(key)
  if (hit && now - hit.at <= REQUEST_MEMO_MAX_AGE_MS) return hit.value as Promise<T>

  const value = (async (): Promise<T> => load())()
  memo.set(key, { value, at: now })
  // Un échec ne se mémorise pas : l'appel suivant retente.
  value.catch(() => {
    if (memo.get(key)?.value === value) memo.delete(key)
  })
  return value
}

/** Oublie, dans la requête courante, toutes les entrées dont la clé commence par `prefix`. */
export function forgetForRequest(prefix: string): void {
  const memo = memoStorage.getStore()
  if (!memo) return
  for (const key of [...memo.keys()]) {
    if (key.startsWith(prefix)) memo.delete(key)
  }
}
