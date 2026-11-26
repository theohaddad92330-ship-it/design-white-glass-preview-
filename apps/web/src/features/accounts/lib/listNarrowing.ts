/**
 * CE QUI COMPTE COMME « LA LISTE EST RESTREINTE » (D300).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI A ÉTÉ MESURÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * Recette live du 30/08/2026, production, sur un espace de 24 comptes analysés.
 * L'encart du bas de `/accounts` propose « Voir les opportunités → », l'URL
 * devient `/accounts?lifecycle=opportunity`, et l'écran répond :
 *
 *   « Aucun compte analysé pour l'instant — lance ta première analyse »
 *
 * Le message du portefeuille INITIAL, mot pour mot, à quelqu'un qui a 24
 * comptes. Le geste proposé coûte 8 crédits et ne répond à rien : la bonne
 * sortie était de retirer le filtre.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA CAUSE
 * ─────────────────────────────────────────────────────────────────────────────
 * La restriction se lisait « une pastille est-elle posée dans la BARRE DE
 * FILTRES ? ». Or `lifecycle` n'y est pas : c'est le seul axe de restriction
 * qui n'a ni pastille, ni onglet (la barre d'onglets n'a plus qu'une entrée
 * depuis la recette finale §20). Il est posé UNIQUEMENT par l'encart
 * d'opportunités, et rien à l'écran ne le montre.
 *
 * Une restriction invisible reste une restriction. C'est cette dérivation, et
 * elle seule, qui répond à la question — l'écrire deux fois garantissait qu'un
 * des deux endroits oublie un axe, ce qui est exactement ce qui s'est produit.
 *
 * ⚠️ Elle commande DEUX choses qui doivent rester d'accord :
 *   - le message de l'état vide (« aucun résultat pour ce filtre » plutôt que
 *     « tu n'as encore rien analysé ») ;
 *   - le PÉRIMÈTRE écrit à côté des compteurs de tête. Ces quatre chiffres sont
 *     comptés par le serveur SUR LE FILTRE (`headlineCounters` part du
 *     constructeur de la liste). Sous `?lifecycle=opportunity`, « 0 suivis »
 *     veut donc dire « aucun compte suivi PARMI les opportunités », et l'écran
 *     l'annonçait « Tout le portefeuille ». Un compteur qui change de
 *     dénominateur sans le dire est un compteur qui ment.
 */

/** `all` n'est pas un rangement : c'est l'absence de rangement. */
const LIFECYCLE_NONE = 'all'

export type ListNarrowing = {
  /** La liste ne montre PAS tout le portefeuille. */
  active: boolean
  /**
   * Le rangement du cycle commercial posé dans l'URL, ou `null`.
   *
   * On garde la VALEUR et pas un booléen : c'est elle qui permet de nommer à
   * l'écran ce qui a été filtré (« aucun compte rangé en “À potentiel” »)
   * plutôt que d'écrire « les filtres » au pluriel devant une barre de filtres
   * vide — ce qui se lit comme un bouton qui ne fait rien.
   */
  lifecycle: string | null
}

export function listNarrowing({
  query,
  filterCount,
  lifecycle,
  headline,
  marketCovered,
  freshness,
  favorite,
  ownership,
  crm,
  imported,
  importJob,
}: {
  query: string
  /** Le nombre de pastilles de la barre de filtres (statut, secteur, score, porte). */
  filterCount: number
  /** `search.lifecycle` tel quel — `undefined` quand rien n'est posé. */
  lifecycle: string | undefined
  /**
   * #1580 — `search.headline` tel quel : le clic sur une métrique
   * DÉCISIONNELLE du bandeau de tête. Comme `lifecycle`, cet axe n'a ni
   * pastille dans la barre de filtres ni onglet — une restriction invisible
   * reste une restriction (D300). Optionnel : un appelant qui ne le passe pas
   * garde le comportement d'avant ce chantier.
   */
  headline?: string
  /**
   * #1575.1 — `search.marketCovered` tel quel. Même nature que `headline` :
   * une restriction posée par un clic sur le bandeau, sans pastille dans la
   * barre de filtres ni onglet. `'all'` n'est pas un rangement, c'est son
   * absence — comme `lifecycle` juste au-dessus.
   */
  marketCovered?: string
  /** #2150.13 — `search.freshness` tel quel ; même nature que `headline`. */
  freshness?: string
  /** #2150.14/.18 — `search.favorite` tel quel ; même nature que `freshness` :
   *  posé par une bascule dédiée, sans pastille ni onglet. */
  favorite?: string
  /** #2150.15 — `search.ownership` tel quel ; même nature que `favorite`. */
  ownership?: string
  /** #4526.3 — `search.crm` tel quel ; une restriction posée par la puce reste dite. */
  crm?: string
  /** #4597.1 — `search.imported` tel quel ; même nature que `crm`. */
  imported?: string
  /** #4597.3 — `search.importJob` tel quel : la liste est ouverte sur UN import. */
  importJob?: string
}): ListNarrowing {
  const ranged = lifecycle != null && lifecycle !== LIFECYCLE_NONE ? lifecycle : null
  const marketCoveredActive = marketCovered != null && marketCovered !== LIFECYCLE_NONE
  const freshnessActive = freshness != null && freshness !== LIFECYCLE_NONE
  const favoriteActive = favorite != null && favorite !== LIFECYCLE_NONE
  const ownershipActive = ownership != null && ownership !== LIFECYCLE_NONE
  return {
    active:
      query.trim().length > 0 ||
      filterCount > 0 ||
      ranged !== null ||
      headline != null ||
      marketCoveredActive ||
      freshnessActive ||
      favoriteActive ||
      ownershipActive ||
      crm === 'only' ||
      imported === 'only' ||
      importJob != null,
    lifecycle: ranged,
  }
}
