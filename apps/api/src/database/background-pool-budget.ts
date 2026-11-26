import { decidePoolMax } from './pool-sizing'

/**
 * #4616.4 — le travail de FOND (workers BullMQ, tâches planifiées) prend AU PLUS la moitié de `DB_POOL_MAX` ;
 * l'autre moitié reste aux requêtes des écrans. Sans cela, une rafale de jobs épuise le pool et les requêtes
 * HTTP font la queue puis tombent en 500 (incident pool du 04/10/2026).
 *
 * Un réglage à UN endroit (GA-26) : la part est cette constante, dérivée de la MÊME taille de pool que
 * `buildDbPoolExtra` (après le clamp de `decidePoolMax`). Aucune variable d'environnement neuve : un
 * `DB_POOL_MAX` suffit, la moitié en découle.
 */
const BACKGROUND_POOL_SHARE = 0.5

/** La moitié (arrondie vers le BAS) de `poolMax`, jamais moins d'un créneau. */
export function backgroundPoolMax(poolMax: number): number {
  return Math.max(1, Math.floor(poolMax * BACKGROUND_POOL_SHARE))
}

/**
 * Sémaphore du travail de fond : au plus `limit` unités en vol, les autres attendent leur tour. Un travail de
 * fond qui touche la base s'enveloppe dans `run()` ; la tâche libère toujours son créneau, échec compris.
 */
export class BackgroundDbBudget {
  private inFlight = 0
  private readonly waiting: Array<() => void> = []

  constructor(readonly limit: number) {}

  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.inFlight >= this.limit) await new Promise<void>(resolve => this.waiting.push(resolve))
    else this.inFlight += 1
    try {
      return await work()
    } finally {
      const next = this.waiting.shift()
      if (next) next()
      else this.inFlight -= 1
    }
  }
}

/** Le budget du process, calculé sur la taille du pool réellement posée (même lecture que `buildDbPoolExtra`). */
export function buildBackgroundDbBudget(env: Record<string, string | undefined> = process.env): BackgroundDbBudget {
  const requested = Number(env['DB_POOL_MAX'])
  const decision = decidePoolMax(Number.isFinite(requested) && requested > 0 ? requested : 10, env)
  return new BackgroundDbBudget(backgroundPoolMax(decision.max))
}
