/**
 * #3822 / J1b — l'exécuteur d'un lot d'enrichissement.
 *
 * Mesuré en production le 07/10 : 21 contacts sélectionnés, 8 traités, 17 restés
 * « Pas encore cherché » sans un mot. Cause : la boucle de l'écran était
 * SÉQUENTIELLE (un contact après l'autre, ~75 s chacun ⇒ plus de 25 min pour 21),
 * sans plafond de temps par contact (une requête de suivi qui ne revient jamais
 * gelait tout le lot), sans arrêt nommé (quitter l'écran la tuait en silence) et
 * sans progression visible.
 *
 * Ici : une concurrence bornée (le débit réel reste borné côté serveur), un
 * plafond de temps PAR contact, et une issue pour CHAQUE contact — ceux qu'un
 * arrêt a empêchés de partir sont `not_processed`, jamais absents.
 */
type BatchItemResult<C, R> =
  | { kind: 'ok'; item: C; value: R }
  | { kind: 'error'; item: C; error: unknown }
  | { kind: 'not_processed'; item: C }

type RunOptions = {
  concurrency: number
  perItemTimeoutMs: number
  signal?: AbortSignal
  /** Une erreur qui rend la suite vaine (crédits épuisés) : les suivants ne partent pas. */
  stopOn?: (error: unknown) => boolean
  onProgress?: (done: number, total: number) => void
}

class EnrichmentItemTimeoutError extends Error {
  constructor() {
    super('enrichment item timed out')
    this.name = 'EnrichmentItemTimeoutError'
  }
}

function withTimeout<R>(promise: Promise<R>, ms: number): Promise<R> {
  return new Promise<R>((resolve, reject) => {
    const timer = setTimeout(() => reject(new EnrichmentItemTimeoutError()), ms)
    promise.then(
      value => {
        clearTimeout(timer)
        resolve(value)
      },
      error => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

export async function runEnrichmentBatch<C, R>(
  items: readonly C[],
  run: (item: C) => Promise<R>,
  options: RunOptions,
): Promise<BatchItemResult<C, R>[]> {
  const results: BatchItemResult<C, R>[] = items.map(item => ({ kind: 'not_processed', item }))
  let next = 0
  let done = 0
  let stopped = false

  const worker = async (): Promise<void> => {
    for (;;) {
      if (stopped || options.signal?.aborted) return
      const index = next
      next += 1
      if (index >= items.length) return
      const item = items[index] as C
      try {
        const value = await withTimeout(run(item), options.perItemTimeoutMs)
        results[index] = { kind: 'ok', item, value }
      } catch (error) {
        results[index] = { kind: 'error', item, error }
        if (options.stopOn?.(error)) stopped = true
      }
      done += 1
      options.onProgress?.(done, items.length)
    }
  }

  const width = Math.max(1, Math.min(options.concurrency, items.length))
  await Promise.all(Array.from({ length: width }, () => worker()))
  return results
}
