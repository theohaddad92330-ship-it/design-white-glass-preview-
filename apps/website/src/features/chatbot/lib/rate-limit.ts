/**
 * La borne de fréquence du §10 — « rate-limit IP/session ».
 *
 * Fenêtre GLISSANTE et non compteur remis à zéro à heure fixe : un plafond qui
 * se réarme d'un coup se vide d'un coup, et c'est précisément le comportement
 * qu'un script cherche. Même raisonnement que le plafond du copilote applicatif,
 * pour la même raison.
 *
 * En mémoire du process, et c'est assumé : le site est servi par peu
 * d'instances, la borne dure vit de toute façon en amont (CDN/hébergeur, seul à
 * voir une IP de façon fiable), et une borne approximative appliquée
 * immédiatement vaut mieux qu'une borne exacte qui exigerait une base.
 *
 * L'horloge est un PARAMÈTRE : le module reste pur et testable, et un test qui
 * dormirait dix minutes ne serait pas un test.
 */

type WindowConfig = {
  /** Durée de la fenêtre, en millisecondes. */
  windowMs: number
  /** Nombre maximum de coups dans la fenêtre. */
  max: number
  /**
   * Nombre de clés retenues. Un site public reçoit des visiteurs anonymes en
   * nombre inconnu : sans borne, la table de compteurs EST la fuite de mémoire.
   */
  maxKeys?: number
}

const DEFAULT_MAX_KEYS = 5000

export class SlidingWindowCounter {
  private readonly hits = new Map<string, number[]>()

  constructor(private readonly config: WindowConfig) {}

  /**
   * Enregistre un coup et rend l'état de la clé APRÈS ce coup.
   *
   * `count` compte les coups retenus dans la fenêtre, `limited` dit si celui-ci
   * dépasse la borne. On compte même le coup refusé : sinon un client bloqué
   * repartirait à zéro dès qu'il ralentit juste sous le seuil.
   */
  hit(key: string, now: number): { count: number; limited: boolean } {
    this.evictIfNeeded(now)
    const since = now - this.config.windowMs
    const previous = (this.hits.get(key) ?? []).filter(stamp => stamp > since)
    previous.push(now)
    this.hits.set(key, previous)
    return { count: previous.length, limited: previous.length > this.config.max }
  }

  /** Combien de coups déjà retenus, sans en ajouter un. */
  count(key: string, now: number): number {
    const since = now - this.config.windowMs
    return (this.hits.get(key) ?? []).filter(stamp => stamp > since).length
  }

  /**
   * Purge d'abord ce qui est périmé ; si la table reste trop grosse, on retire
   * les clés les plus anciennes. Refuser d'enregistrer serait pire : la borne
   * cesserait de s'appliquer exactement quand le trafic la rend utile.
   */
  private evictIfNeeded(now: number): void {
    const maxKeys = this.config.maxKeys ?? DEFAULT_MAX_KEYS
    if (this.hits.size <= maxKeys) return

    const since = now - this.config.windowMs
    for (const [key, stamps] of this.hits) {
      const kept = stamps.filter(stamp => stamp > since)
      if (kept.length === 0) this.hits.delete(key)
      else this.hits.set(key, kept)
    }
    if (this.hits.size <= maxKeys) return

    const byAge = [...this.hits.entries()].sort((a, b) => (a[1].at(-1) ?? 0) - (b[1].at(-1) ?? 0))
    for (const [key] of byAge.slice(0, this.hits.size - maxKeys)) this.hits.delete(key)
  }
}
