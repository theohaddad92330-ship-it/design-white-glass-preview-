/**
 * #2325.32 — « détecte [les affaires avec] plusieurs owners ».
 *
 * Une affaire porte UN `owner_id` (`opportunities.owner_id`), mais les TÂCHES
 * ouvertes qui s'y rattachent (`tasks.project_id`) portent chacune leur PROPRE
 * `owner_id` (`tasks.owner_id`) — rien n'empêche aujourd'hui qu'une tâche
 * ouverte sur l'affaire de Marc soit assignée à Sarah, sans qu'aucun des deux
 * ne le sache. C'est un DÉFAUT DE COORDINATION sur UNE affaire, pas une
 * comparaison ENTRE commerciaux (au sens que #2325.34/.35 écartent) : le
 * signal ne dit jamais « Sarah est plus lente que Marc », il dit « cette
 * affaire a deux porteurs qui l'ignorent l'un de l'autre » — la même distance
 * qu'entre « cet écran est abandonné » et « Sarah abandonne les écrans ».
 *
 * `ownerIds` est l'ensemble des porteurs distincts, NON NULS, vus sur l'affaire
 * (son propre `owner_id` PLUS les `owner_id` de ses tâches ouvertes) — jamais
 * un rang, jamais un jugement sur lequel devrait porter l'affaire.
 */
export type OpportunityOwnersCandidate = {
  id: string
  /** Tous les porteurs vus sur cette affaire (propriétaire + tâches ouvertes),
   *  `null` déjà filtré par l'appelant — un porteur INCONNU n'entre pas en jeu. */
  ownerIds: readonly string[]
}

export type MultiOwnerOpportunity = {
  opportunityId: string
  /** Au moins deux porteurs distincts, dédupliqués, ordre stable d'apparition. */
  ownerIds: readonly string[]
}

/**
 * Les affaires portées par plusieurs personnes à la fois.
 *
 * Déterministe, sans effet de bord, et vide quand il n'y a rien : une liste
 * vide veut dire « aucune affaire à plusieurs porteurs parmi CE QU'ON A LU »,
 * jamais « aucune dans l'espace ».
 */
export function detectMultiOwnerOpportunities(
  opportunities: readonly OpportunityOwnersCandidate[],
): MultiOwnerOpportunity[] {
  const results: MultiOwnerOpportunity[] = []
  for (const opportunity of opportunities) {
    const distinct = [...new Set(opportunity.ownerIds.filter((ownerId): ownerId is string => Boolean(ownerId)))]
    if (distinct.length < 2) continue
    results.push({ opportunityId: opportunity.id, ownerIds: distinct })
  }
  return results
}
