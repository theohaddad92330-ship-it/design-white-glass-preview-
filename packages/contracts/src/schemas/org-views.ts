/**
 * Les quatre vues de l'organigramme (recette finale §50).
 *
 * Une PROJECTION, pas un nouveau contrat de fil. Le graphe transporte déjà
 * entités, liens hiérarchiques, influences, comité d'achat et chemin
 * recommandé ; les quatre vues n'ajoutent aucune donnée, elles les rangent.
 * Les faire voyager sur le fil renégocierait le contrat entre trois services
 * pour une information que chacun peut recalculer — et la recalculer ici, une
 * fois, garantit que personne ne réinvente la règle à sa façon.
 *
 * **La distinction qui porte tout** : « Organisation vérifiée » n'accepte que
 * des liens SOURCÉS ; « Carte d'influence » accepte les hypothèses, avec leur
 * confiance. Les mélanger, comme le faisait l'écran, rend impossible de savoir
 * ce qui est prouvé. Or le lecteur décide de son approche sur les flèches : une
 * flèche inférée lue comme un fait envoie un commercial vers le mauvais
 * interlocuteur en lui donnant l'assurance du contraire.
 */

/** Un lien du graphe, réduit à ce dont la projection a besoin. */
export type OrgEdgeLike = {
  type?: string
  verified?: boolean
  confidence?: number | null
  [key: string]: unknown
}

export type OrgGraphLike = {
  entities?: unknown[]
  people?: unknown[]
  hierarchyEdges?: OrgEdgeLike[]
  influenceEdges?: OrgEdgeLike[]
  buyingCommittee?: unknown
  recommendedPath?: unknown[]
}

export type OrgViews = {
  /** Ce qui est PROUVÉ : entités et liens hiérarchiques sourcés. */
  verifiedOrganisation: { entities: unknown[]; edges: OrgEdgeLike[] }
  /** Ce qui est PROBABLE : influences, et liens hiérarchiques non sourcés. */
  influenceMap: { edges: OrgEdgeLike[] }
  /** Qui décide quoi sur une opportunité précise. */
  buyingCommittee: unknown
  /** Qui contacter, et dans quel ordre. */
  recommendedPath: unknown[]
  /** Combien de liens sont prouvés sur le total — de quoi écrire « 3 liens sur
   *  17 sont sourcés » plutôt que de laisser croire à un organigramme complet. */
  counts: { verified: number; inferred: number }
}

/** Le partage brut d'une liste de liens hiérarchiques : ce que le graphe
 *  DÉCLARE prouvé, et le reste. Générique, pour que l'appelant garde le type
 *  exact de ses liens — un web qui reçoit des `unknown[]` devrait les
 *  re-caster, et un cast est une occasion de se tromper. */
export type OrgHierarchyPartition<E extends OrgEdgeLike> = { verified: E[]; inferred: E[] }

/**
 * Le partage « prouvé / hypothèse », à UN seul endroit (D38 du 28/08).
 *
 * Il vivait en trois exemplaires — ici, dans le read-model des quatre vues du
 * web, et dans celui de la carte d'influence. Trois chemins qui refont la même
 * dérivation divergent : il suffit qu'un seul se mette à lire la confiance pour
 * qu'un même lien soit un fait sur un écran et une hypothèse sur l'autre.
 *
 * Deux invariants que le déplacement ne doit pas perdre :
 *   · le partage se fait sur `verified === true`, **jamais sur la confiance** —
 *     une inférence à 95 % reste une inférence (§49) ;
 *   · le repli est l'HYPOTHÈSE (`!== true`, pas `=== false`) : un lien qui ne
 *     dit rien de sa vérification n'a rien prouvé.
 *
 * L'ORDRE reçu est conservé dans les deux listes — les écrans trient ensuite
 * pour l'affichage, et deux tris superposés ne rendent pas la même liste.
 */
export function partitionOrgHierarchy<E extends OrgEdgeLike>(
  edges: readonly E[] | null | undefined,
): OrgHierarchyPartition<E> {
  const list = edges ?? []
  return {
    verified: list.filter(edge => edge?.verified === true),
    inferred: list.filter(edge => edge?.verified !== true),
  }
}

/** La nature d'un trait DESSINÉ : d'où le lien vient dans le graphe.
 *  `entity_tree` = appartenance structurelle (`parentId`) ; `member_of` =
 *  rattachement d'une personne ; `reports_to` = ligne de reporting ;
 *  `influences` = une influence probabiliste sur un sujet (#2121.32,
 *  `orgInfluenceEdgeSchema`) ; `works_with` = une collaboration entre deux
 *  personnes, hors hiérarchie (#2121.34, `orgHierarchyRelationSchema`). */
export type OrgLinkNature = 'entity_tree' | 'member_of' | 'reports_to' | 'influences' | 'works_with'

/**
 * Ce qu'un trait a le droit d'affirmer de lui-même.
 *
 * Quatre états, et quatre seulement :
 *   · `sourced`   — le graphe le déclare vérifié ET une preuve EXTERNE est
 *                   MONTRABLE (`official_site`, `org_chart`, `registry`…) ;
 *   · `declared`  — #2121.35 : un COMMERCIAL l'a déclaré depuis le terrain
 *                   (`OrgCorrectionDrawer` → source `kind: 'workspace_user'`).
 *                   Une déclaration humaine n'est pas un document tiers : les
 *                   confondre sous « vérifié » perdrait la FORCE de la preuve ;
 *   · `structure` — l'arbre des entités : ce n'est pas une inférence sur une
 *                   personne, c'est la forme du groupe ;
 *   · `assumed`   — tout le reste (« probable »).
 */
export type OrgLinkOrigin = 'sourced' | 'declared' | 'structure' | 'assumed'

/** Un trait dessiné, réduit à ce dont la règle a besoin. `sources` porte les
 *  preuves RÉSOLUES — celles que l'écran peut montrer —, pas les identifiants
 *  cités par le lien. `kind` (#2121.35) distingue une preuve EXTERNE d'une
 *  déclaration `workspace_user` ; une source qui ne le porte pas (anciens
 *  graphes, tests) n'est simplement jamais `declared`. */
export type OrgLinkLike = {
  nature: OrgLinkNature
  verified: boolean
  sources: readonly { kind?: string }[]
}

/**
 * Ce qu'un trait a le droit d'affirmer — la règle, à UN seul endroit (D38).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ ELLE EST PLUS STRICTE QUE {@link partitionOrgHierarchy}, ET C'EST VOULU
 * ─────────────────────────────────────────────────────────────────────────
 * La partition répond à « qu'est-ce que le graphe DÉCLARE prouvé ? » ; cette
 * règle répond à « qu'est-ce que l'écran peut MONTRER ? ». Le schéma garantit
 * qu'un lien vérifié CITE au moins un `sourceId` ; il ne garantit pas que cette
 * citation retombe sur une source réellement émise par un nœud. Un lien dont la
 * preuve est introuvable est donc compté « vérifié » par la partition et
 * dessiné « hypothèse » par cette règle — sans quoi on afficherait une
 * provenance fabriquée, ce que la doctrine interdit.
 *
 * Les deux règles vivent côte à côte ici pour que personne ne les « unifie » en
 * croyant supprimer un doublon : ce sont deux questions différentes.
 *
 * ⚠️ Un score élevé ne fait basculer aucun lien du côté des faits — même
 * arbitrage que {@link toOrgViews}.
 */
export function orgLinkOrigin(link: OrgLinkLike): OrgLinkOrigin {
  if (link.nature === 'entity_tree') return 'structure'
  // #2121.35 — une déclaration terrain prime sur « sourced » : c'est un fait
  // plus précis (QUI l'a dit), pas un fait plus faible. `??` garde le défaut
  // conservateur d'une source sans `kind` connu (jamais lue comme déclarée).
  if (link.sources.some(source => (source?.kind ?? null) === 'workspace_user')) return 'declared'
  return link.verified && link.sources.length > 0 ? 'sourced' : 'assumed'
}

/**
 * Range un graphe en quatre vues.
 *
 * Le partage se fait sur `verified === true`, **jamais sur la confiance**. Une
 * inférence à 95 % reste une inférence ; un seuil ferait basculer des
 * hypothèses du côté des faits sans que personne ne l'ait décidé, et c'est
 * exactement le glissement que le §49 interdit.
 */
export function toOrgViews(graph: OrgGraphLike | null | undefined): OrgViews {
  const { verified, inferred } = partitionOrgHierarchy(graph?.hierarchyEdges)

  return {
    verifiedOrganisation: { entities: graph?.entities ?? [], edges: verified },
    influenceMap: { edges: [...inferred, ...(graph?.influenceEdges ?? [])] },
    buyingCommittee: graph?.buyingCommittee ?? null,
    recommendedPath: graph?.recommendedPath ?? [],
    counts: { verified: verified.length, inferred: inferred.length },
  }
}

/**
 * L'organigramme est-il assez sourcé pour être DESSINÉ ?
 *
 * Le §52 tranche : sans hiérarchie sourcée, on rend une carte de contacts, pas
 * un arbre. Un organigramme partiellement inventé est plus nuisible qu'une
 * carte assumée — le lecteur prend ses décisions sur les flèches, et une carte
 * sans flèches le laisse chercher, ce qui est le bon comportement quand on ne
 * sait pas.
 */
export function canDrawOrgChart(views: OrgViews): boolean {
  return views.counts.verified > 0
}
