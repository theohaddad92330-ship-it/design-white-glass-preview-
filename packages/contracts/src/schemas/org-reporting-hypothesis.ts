import type { OrgClaim, OrgHierarchyRelation, OrgInfluenceEdge, OrgPerson } from './org-graph.js'

/* ------------------------------------------------------------------ */
/*  L'HYPOTHÈSE DE RATTACHEMENT — le sujet retrouvé de « vérifier ce   */
/*  lien » (D360 du 30/08/2026)                                        */
/* ------------------------------------------------------------------ */

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * « Vérifier ce lien » était monté aux deux endroits qu'il faut — la carte de la
 * personne (écran d'arrivée) et les « 4 vues » — et il ne se rendait nulle part.
 * Les deux montages lisaient `hierarchyEdges` filtrés sur `reports_to`, et
 * l'assembleur n'en produit PLUS depuis le correctif P0 du 29/08 : une
 * `reportingTo` est une supposition du modèle, sa provenance est `llm`, donc
 * grounding C, donc le resolver la range en INFLUENCE.
 *
 * Mesuré le 30/08 en exécutant l'assembleur sur un dossier réaliste (quatre
 * contacts, trois `reportingTo`, une entité et une BU) :
 *
 *     hierarchyEdges par type ......... { member_of: 4 }
 *     hierarchyEdges reports_to ....... 0
 *     influenceEdges par topic ........ { « rattachement hiérarchique »: 3 }
 *     member_of dont la cible est une entité ... 4 / 4
 *
 * Le sujet du geste n'a donc pas disparu : il a CHANGÉ DE TABLEAU. Il vit
 * maintenant dans `influenceEdges`, sous le topic que l'assembleur pose lui-même
 * (`_RELATION_TOPIC["reports_to"]`). Ce fichier lui donne un nom TypeScript et
 * une dérivation, à UN seul endroit — le web en a besoin pour la carte, l'API en
 * a besoin pour retrouver le lien à vérifier, et deux dérivations écrites à la
 * main divergeraient au premier changement de libellé (motif « clé de cache
 * recopiée à la main »).
 *
 * ⚠️ CE QUE CE FICHIER NE FAIT PAS : promouvoir. Une hypothèse reste une
 * hypothèse. Elle devient une ligne de l'organigramme quand — et seulement quand
 * — une preuve qui a OBSERVÉ LE LIEN est produite. Voir
 * {@link claimBacksOrgRelation}.
 */

/**
 * Le sujet sous lequel un rattachement DÉGRADÉ voyage dans `influenceEdges`.
 *
 * ⚠️ **Cette chaîne est écrite en DEUX langages** : ici, et dans
 * `_RELATION_TOPIC["reports_to"]` de `apps/ia/app/services/org_graph_assembler.py`
 * qui la produit. C'est une jointure par chaîne de caractères entre deux
 * services — exactement la forme qui casse en silence le jour où l'un des deux
 * change de libellé, sans qu'aucun type ne rougisse. **GA-126 lit le fichier
 * Python et compare** : la garde est le seul lien mécanique entre les deux.
 */
export const ORG_REPORTING_INFLUENCE_TOPIC = 'rattachement hiérarchique'

/**
 * **Ce qu'une preuve doit avoir OBSERVÉ pour étayer une relation.**
 *
 * Miroir EXACT de `_CLAIMS_BACKING` (`apps/ia/app/services/org_graph_assembler.py`),
 * et GA-127 le prouve en lisant les deux tables. La règle a été rendue MÉCANIQUE
 * côté Python le 29/08 (GA-98 / GA-99) ; elle ne l'était pas côté TypeScript, où
 * le seul chemin d'écriture d'un lien hiérarchique — `applyRelationVerdict` — ne
 * lisait aucun claim. Une porte unique écrite dans un seul langage n'est pas une
 * porte : c'est une porte et une fenêtre ouverte.
 *
 * La frontière qui porte tout : `identity` ≠ `relation`. Un profil qui établit
 * qu'une personne EXISTE n'établit pas à qui elle rapporte.
 *
 * `member_of` accepte `identity`, et c'est la SEULE exception — elle est NOMMÉE,
 * pas tolérée : l'enregistrement d'un fournisseur dit « Marie Martin,
 * Responsable Data CHEZ TF1 », il a donc réellement observé l'employeur en même
 * temps que la personne. Ce qu'il n'a JAMAIS observé, c'est un lien entre DEUX
 * PERSONNES.
 */
export const ORG_RELATION_CLAIM_BACKING = {
  member_of: ['identity', 'membership'],
  reports_to: ['relation'],
  sponsors: ['relation'],
  owns_budget: ['relation'],
  procures_for: ['relation'],
  // #2121.34 — même frontière que les autres relations Personne↔Personne :
  // une preuve d'identité n'a jamais observé une COLLABORATION entre deux gens.
  works_with: ['relation'],
} as const satisfies Record<OrgHierarchyRelation, readonly OrgClaim[]>

/**
 * Cette preuve étaye-t-elle CETTE relation ?
 *
 * `claim` absent ⇒ **non**, et ce n'est pas un durcissement gratuit : c'est la
 * moitié GA-99 de la règle. Une preuve dont on ne sait pas ce qu'elle prouve
 * n'étaye rien — sans quoi un producteur neuf qui oublie de déclarer son claim
 * rouvre le P0 par une porte que personne ne surveille.
 */
export function claimBacksOrgRelation(relation: OrgHierarchyRelation, claim: OrgClaim | undefined): boolean {
  if (!claim) return false
  return (ORG_RELATION_CLAIM_BACKING[relation] as readonly OrgClaim[]).includes(claim)
}

/** Une hypothèse de rattachement : deux PERSONNES du graphe, et rien d'autre. */
export type OrgReportingHypothesis = {
  /** La personne qui rapporterait. */
  fromId: string
  /** Le N+1 supposé. Toujours une personne — jamais une entité. */
  toId: string
  /** Ce que l'analyse a écrit pour l'expliquer. Jamais vide (invariant du contrat). */
  reasoning: string
}

/** Le minimum dont la dérivation a besoin — pour qu'un appelant qui ne porte pas
 *  un `OrgGraph` complet (l'API lit un graphe stocké, le web un graphe validé)
 *  puisse quand même l'appeler sans re-caster. */
export type OrgReportingHypothesisInput = {
  people: readonly Pick<OrgPerson, 'id'>[]
  influenceEdges: readonly OrgInfluenceEdge[]
}

/**
 * Les rattachements que l'analyse SUPPOSE, et que personne n'a encore vérifiés.
 *
 * Trois filtres, et chacun ferme une porte :
 *
 *  1. le topic est celui que l'assembleur pose sur un `reports_to` dégradé — un
 *     sujet métier (« Choix des partenaires techniques ») n'est pas un
 *     rattachement, et proposer d'en « vérifier le lien » n'aurait aucun sens ;
 *  2. les DEUX extrémités sont des personnes du graphe — une cible entité rend
 *     la vérification impossible (le vérificateur cherche deux NOMS sur une même
 *     page), et c'est exactement le 412 que les « 4 vues » servaient sur les
 *     `member_of` ;
 *  3. `fromId !== toId`.
 *
 * L'ORDRE reçu est conservé : deux tris superposés ne rendent pas la même liste.
 */
export function orgReportingHypotheses(
  graph: OrgReportingHypothesisInput | null | undefined,
): OrgReportingHypothesis[] {
  const personIds = new Set((graph?.people ?? []).map(person => person.id))
  return (graph?.influenceEdges ?? [])
    .filter(
      edge =>
        edge.topic === ORG_REPORTING_INFLUENCE_TOPIC &&
        edge.fromId !== edge.toId &&
        personIds.has(edge.fromId) &&
        personIds.has(edge.toId),
    )
    .map(edge => ({ fromId: edge.fromId, toId: edge.toId, reasoning: edge.reasoning }))
}
