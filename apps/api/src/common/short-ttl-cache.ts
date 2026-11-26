/**
 * Perf 29/09/2026 — lecture COURTE mise en mémoire : « single-flight » + TTL.
 *
 * Pourquoi en mémoire du processus et pas Redis : les lectures visées
 * (brief du jour, cockpit, capacité, agendas) sont demandées par le MÊME écran
 * en rafale (3 appels `finance/capacity`, `briefing/today` + `briefing/actions`
 * + `dashboard/me` à l'ouverture) ; un aller-retour Redis coûte autant qu'une
 * requête SQL du pool et le TTL est de 60 s. Même précédent que
 * `market-memory.service.ts` (`cohortPeersCache`) et `tool-registry.service.ts`.
 *
 * Trois règles, écrites pour être tenues :
 *  1. **Un cache ne change pas le contenu** : la valeur rendue est celle que la
 *     lecture aurait rendue au plus tard `ttlMs` plus tôt, jamais une valeur
 *     inventée.
 *  2. **Un échec n'est JAMAIS mis en cache** : la promesse rejetée est retirée,
 *     l'appel suivant relit. Une panne passagère ne se fige donc pas 60 s.
 *  3. **La clé porte TOUJOURS l'identité de la portée** (userId + workspaceId) :
 *     la construire est le travail de l'appelant, ce module ne devine rien.
 *
 * `shouldCache` permet à l'appelant de refuser de retenir un résultat dégradé
 * (ex. un bloc « indisponible » qui n'est qu'un repli, pas une mesure).
 */
export class ShortTtlCache<T> {
  private readonly entries = new Map<string, { expiresAt: number; value: Promise<T> }>()

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 500,
    private readonly now: () => number = Date.now,
  ) {}

  async getOrLoad(key: string, load: () => Promise<T>, shouldCache: (value: T) => boolean = () => true): Promise<T> {
    const at = this.now()
    const hit = this.entries.get(key)
    if (hit && hit.expiresAt > at) return hit.value

    if (this.entries.size >= this.maxEntries) this.evict(at)

    const value = load()
    this.entries.set(key, { expiresAt: at + this.ttlMs, value })
    try {
      const resolved = await value
      if (!shouldCache(resolved) && this.entries.get(key)?.value === value) this.entries.delete(key)
      return resolved
    } catch (error) {
      if (this.entries.get(key)?.value === value) this.entries.delete(key)
      throw error
    }
  }

  /** Une écriture évidente vide la portée : la lecture suivante relit. */
  invalidate(keyPrefix: string): void {
    for (const key of this.entries.keys()) if (key.startsWith(keyPrefix)) this.entries.delete(key)
  }

  /**
   * Lecture SANS déclencher `load` — permet à l'appelant de savoir, AVANT de
   * lire le reste (les lignes d'un lot de clés manquantes), lesquelles sont
   * déjà chaudes, pour ne charger que ce qui manque EN UNE requête groupée
   * plutôt qu'une par clé. `undefined` si absente ou expirée : jamais une
   * valeur périmée rendue comme fraîche.
   */
  peek(key: string): Promise<T> | undefined {
    const hit = this.entries.get(key)
    return hit && hit.expiresAt > this.now() ? hit.value : undefined
  }

  private evict(at: number): void {
    for (const [key, entry] of this.entries) if (entry.expiresAt <= at) this.entries.delete(key)
    // Toujours plein d'entrées vivantes : on retire la plus ancienne (ordre d'insertion).
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value
      if (oldest !== undefined) this.entries.delete(oldest)
    }
  }
}

/**
 * Le « single-flight » sans TTL : les appels CONCURRENTS de la même clé
 * partagent une seule lecture, et rien n'est retenu une fois elle finie —
 * donc jamais une valeur périmée. Pour les lectures qui décident de droits
 * (résolution de l'espace actif) où même 1 s de retard serait trop.
 */
export class InFlight<T> {
  private readonly pending = new Map<string, Promise<T>>()

  run(key: string, load: () => Promise<T>): Promise<T> {
    const existing = this.pending.get(key)
    if (existing) return existing
    const promise = load().finally(() => {
      if (this.pending.get(key) === promise) this.pending.delete(key)
    })
    this.pending.set(key, promise)
    return promise
  }
}
