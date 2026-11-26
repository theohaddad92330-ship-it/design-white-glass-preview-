/**
 * La couverture de l'enrichissement — la mesure qui décide s'il faut payer un
 * fournisseur de repli.
 *
 * La question est concrète : Apollo est le fournisseur par défaut, cinq autres
 * (SalesQL, Dropcontact, Hunter, Lusha, Kaspr) attendent derrière lui et coûtent
 * chacun un abonnement. Ils ne sont appelés que quand Apollo n'a rien trouvé.
 * Leur valeur se résume donc au taux d'échec d'Apollo — que personne n'avait
 * jamais regardé, parce qu'il ne vivait que dans une ligne de log.
 *
 * Les données existent déjà sur `contacts` (migration `1786500000000`) : qui a
 * répondu, si la tentative a rendu du neuf, et ce qui manque encore. Ce module
 * ne fait que les LIRE et les mettre en forme. Il ne calcule rien de nouveau.
 *
 * Trois règles d'honnêteté, les mêmes que `quality-metrics.ts` :
 *
 * - un taux sans dénominateur vaut `null`, jamais 0 %. Un espace qui n'a jamais
 *   enrichi ne doit pas afficher « 0 % de réussite » et faire chercher une panne ;
 * - un contact JAMAIS tenté n'est pas un échec — il sort du calcul ;
 * - ce qui manque après une tentative est compté À PART du reste : c'est cette
 *   ventilation, et elle seule, qui dit QUEL type de fournisseur aiderait.
 */

/** Une ligne telle que la base la rend : une tentative d'enrichissement. */
export type EnrichmentAttemptRow = {
  /** `matched` (des informations neuves sont arrivées) | `no_new_data`. */
  result: string | null
  /** Qui a répondu en dernier — `apollo`, `dropcontact`, `salesql`… */
  provider: string | null
  /** Canaux encore vides à l'issue de la tentative (`email`, `phone`, `linkedin`). */
  missing: string[] | null
}

type ProviderShare = {
  provider: string
  resolved: number
  /**
   * #3022 (retour bêta) : sur les tentatives où CE fournisseur a été crédité de
   * la résolution, la part qui a AUSSI laissé le téléphone renseigné à l'issue —
   * la coordonnée qui manquait le plus souvent. Agrégée PAR FOURNISSEUR, jamais
   * par personne (doctrine : un taux de couverture mesure ce qu'on SAIT, jamais
   * un contact nommé). Le dénominateur est `resolved`, toujours ≥ 1 pour une
   * entrée présente ici — un vrai 0 % mesuré, pas un « non mesuré ».
   */
  phoneFoundRate: number
}
type MissingChannel = { channel: string; count: number }

export type EnrichmentCoverage = {
  /** Fenêtre observée, en jours. */
  days: number
  /** Tentatives réellement faites — le dénominateur de tout le reste. */
  attempts: number
  /** Tentatives qui ont rendu du neuf. */
  resolved: number
  /** Tentatives sans rien de neuf. */
  unresolved: number
  /**
   * Taux de résolution, `null` quand rien n'a été tenté. C'est ce `null` qui
   * empêche de lire « 0 % » là où la vraie réponse est « on ne sait pas ».
   */
  resolutionRate: number | null
  /** Qui résout, par fournisseur, du plus productif au moins productif. */
  byProvider: ProviderShare[]
  /**
   * Ce qui manque ENCORE après une tentative aboutie ou non. C'est le chiffre
   * qui oriente l'achat : beaucoup d'`email` manquants ⇒ un chercheur d'adresses
   * se paierait ; surtout du `phone` ⇒ aucun des candidats ne changerait rien.
   */
  missingChannels: MissingChannel[]
  /**
   * La part que le repli a réellement apportée : tentatives résolues par un
   * AUTRE fournisseur qu'Apollo. À zéro, aucun abonnement de repli ne se
   * justifie — c'est la lecture directe de la décision.
   */
  resolvedByFallback: number
}

/** Le fournisseur par défaut de la cascade. Tout le reste est un repli. */
const DEFAULT_PROVIDER = 'apollo'

/**
 * Agrège des tentatives en une couverture.
 *
 * Pur : `days` est un paramètre, aucune horloge n'est lue ici. Les lignes
 * arrivent déjà filtrées sur la fenêtre par l'appelant — le SQL sait faire une
 * comparaison de dates mieux que nous.
 */
export function buildEnrichmentCoverage(rows: readonly EnrichmentAttemptRow[], days: number): EnrichmentCoverage {
  const attempts = rows.length
  const resolved = rows.filter(r => r.result === 'matched').length

  const providerCounts = new Map<string, number>()
  // #3022 — parmi les tentatives créditées à CE fournisseur, combien laissent le
  // téléphone renseigné à l'issue. Compté à part de `missingCounts` (qui, lui,
  // agrège TOUS les canaux TOUS fournisseurs confondus) parce que la décision
  // d'achat est PAR FOURNISSEUR : « Lusha comble le téléphone 40 % du temps »
  // oriente un abonnement, « le téléphone manque globalement » non.
  const providerPhoneFoundCounts = new Map<string, number>()
  const missingCounts = new Map<string, number>()

  for (const row of rows) {
    // Le fournisseur ne compte que sur une tentative ABOUTIE : celui qui a
    // répondu « rien » n'a rien résolu, et l'inscrire au tableau des résolveurs
    // le ferait passer pour productif.
    if (row.result === 'matched' && row.provider) {
      providerCounts.set(row.provider, (providerCounts.get(row.provider) ?? 0) + 1)
      if (!(row.missing ?? []).includes('phone')) {
        providerPhoneFoundCounts.set(row.provider, (providerPhoneFoundCounts.get(row.provider) ?? 0) + 1)
      }
    }
    for (const channel of row.missing ?? []) {
      missingCounts.set(channel, (missingCounts.get(channel) ?? 0) + 1)
    }
  }

  const byProvider = [...providerCounts.entries()]
    .map(([provider, count]) => ({
      provider,
      resolved: count,
      phoneFoundRate: (providerPhoneFoundCounts.get(provider) ?? 0) / count,
    }))
    .sort((a, b) => b.resolved - a.resolved || a.provider.localeCompare(b.provider))

  return {
    days,
    attempts,
    resolved,
    unresolved: attempts - resolved,
    resolutionRate: attempts === 0 ? null : resolved / attempts,
    byProvider,
    missingChannels: [...missingCounts.entries()]
      .map(([channel, count]) => ({ channel, count }))
      .sort((a, b) => b.count - a.count || a.channel.localeCompare(b.channel)),
    resolvedByFallback: byProvider.filter(p => p.provider !== DEFAULT_PROVIDER).reduce((sum, p) => sum + p.resolved, 0),
  }
}

/** Les trois canaux d'un contact, tels que la base les rend. */
export type ContactReachabilityRow = {
  email: string | null
  phone: string | null
  linkedin_url: string | null
}

/**
 * #3549.1 — la part des contacts ENRICHIS qui a chaque canal. Mesure de stock,
 * complémentaire de {@link buildEnrichmentCoverage} (qui compte des tentatives) :
 * c'est elle qui chiffre « trop souvent je n'ai que le LinkedIn ».
 *
 * Mêmes règles d'honnêteté : sans contact enrichi, chaque part vaut `null`
 * (jamais 0 %), et un canal blanc compte comme absent.
 */
export type ContactReachability = {
  enriched: number
  withEmail: number | null
  withPhone: number | null
  withLinkedin: number | null
  /** LinkedIn renseigné, ni e-mail ni téléphone. */
  onlyLinkedin: number | null
  onlyLinkedinCount: number
}

const hasValue = (value: string | null): boolean => (value ?? '').trim() !== ''

export function buildContactReachability(rows: readonly ContactReachabilityRow[]): ContactReachability {
  const enriched = rows.length
  if (enriched === 0) {
    return { enriched, withEmail: null, withPhone: null, withLinkedin: null, onlyLinkedin: null, onlyLinkedinCount: 0 }
  }
  const withEmail = rows.filter(r => hasValue(r.email)).length
  const withPhone = rows.filter(r => hasValue(r.phone)).length
  const withLinkedin = rows.filter(r => hasValue(r.linkedin_url)).length
  const onlyLinkedinCount = rows.filter(
    r => hasValue(r.linkedin_url) && !hasValue(r.email) && !hasValue(r.phone),
  ).length
  return {
    enriched,
    withEmail: withEmail / enriched,
    withPhone: withPhone / enriched,
    withLinkedin: withLinkedin / enriched,
    onlyLinkedin: onlyLinkedinCount / enriched,
    onlyLinkedinCount,
  }
}
