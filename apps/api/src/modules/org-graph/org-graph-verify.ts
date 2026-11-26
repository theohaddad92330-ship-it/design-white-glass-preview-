import {
  claimBacksOrgRelation,
  orgGraphSchema,
  orgInferredReportings,
  orgReportingHypotheses,
  type OrgGraph,
  type OrgHierarchyRelation,
  type OrgSource,
} from '@bellum/contracts'

/**
 * Application du verdict de « vérifier une relation » (annexe p22) sur le graphe
 * STOCKÉ. Fonction PURE : la recherche est faite ailleurs (service IA), ici on
 * ne fait qu'écrire ce qui a été prouvé.
 *
 * Trois refus explicites, tous rendus par `null` (= ne rien écrire) :
 *   · aucune preuve trouvée — l'absence de preuve n'est pas une preuve du
 *     contraire, on ne dégrade pas un lien existant ;
 *   · le lien visé n'existe NI comme ligne hiérarchique NI comme hypothèse de
 *     rattachement — on ne fabrique pas la relation qu'on vérifie ;
 *   · le lien est déjà vérifié — il est sourcé, il n'y a rien à revérifier.
 *
 * Le résultat est RE-VALIDÉ contre le contrat : un `verified` sans source ou
 * sous 90 viole un invariant zod, et on préfère ne rien écrire qu'écrire un
 * graphe qui ment.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * D360 — CE CHEMIN SAIT MAINTENANT PROMOUVOIR UNE HYPOTHÈSE
 * ─────────────────────────────────────────────────────────────────────────────
 * Depuis le correctif P0 du 29/08, l'assembleur ne produit plus de
 * `hierarchyEdge` de type `reports_to` : un `reportingTo` est une supposition du
 * modèle, sa provenance est `llm`, donc grounding C, donc le resolver la range
 * en INFLUENCE sous le topic « rattachement hiérarchique ». Mesuré le 30/08 sur
 * la sortie réelle de l'assembleur : `reports_to` produits = 0.
 *
 * Il n'y avait donc plus AUCUN lien de reporting à vérifier — et le seul
 * producteur de lignes de reporting devenait la correction humaine, c'est-à-dire
 * l'affirmation. « On propose, l'utilisateur tranche » n'a plus de sens si rien
 * n'est proposé. Ce chemin retrouve donc son sujet : il vérifie l'HYPOTHÈSE, et
 * quand une preuve la confirme, il crée la ligne.
 *
 * ⚠️ ET C'EST EXACTEMENT LÀ QUE LE P0 POUVAIT ROUVRIR. Créer une ligne de
 * reporting est un chemin d'écriture NEUF : aucune garde ne le regardait, et il
 * aurait suffi qu'une preuve d'identité s'y invite pour défaire la décision n°6.
 * La promotion passe donc par la même règle que l'assembleur, écrite en TypeScript
 * cette fois — {@link claimBacksOrgRelation}, miroir de `_CLAIMS_BACKING`. Une
 * porte unique écrite dans un seul langage n'est pas une porte. Garde GA-127.
 */

/** Ce que le service IA répond pour un lien. `confidence: null` = rien trouvé. */
export type RelationVerdict = {
  verified: boolean
  confidence: number | null
  sources: OrgSource[]
}

/**
 * Ce que les preuves du VÉRIFICATEUR ont observé, et qu'elles ne déclarent pas
 * encore elles-mêmes.
 *
 * `relation_verifier.verdict_from_hits` ne retient un hit que s'il nomme LES
 * DEUX personnes — « une page qui ne cite qu'un des deux ne dit rien du lien
 * entre eux ». Sa sortie est donc, par construction, une observation de la
 * PAIRE : c'est le seul endpoint du dépôt dont ce soit vrai. Déclarer ce claim
 * ici n'est pas un contournement de la porte, c'est dire ce que la preuve a vu
 * pour qu'elle puisse y passer.
 *
 * ⚠️ Il ne RÉÉCRIT jamais un claim déjà déclaré : le jour où le service IA
 * déclarera les siens, y compris `identity`, l'API doit le croire — sinon ce
 * défaut deviendrait un blanc-seing et la porte une décoration.
 */
const VERIFIER_OBSERVED_CLAIM = 'relation' as const

function withDeclaredClaim(sources: readonly OrgSource[]): OrgSource[] {
  return sources.map(source => (source.claim ? source : { ...source, claim: VERIFIER_OBSERVED_CLAIM }))
}

/** Les preuves du nœud, ENRICHIES de celles qui manquent. Une preuve vit sur un
 *  nœud : c'est là, et seulement là, que les `sourceIds` d'un edge se résolvent
 *  (le front comme le contrat lisent `people[].sources`). */
function withSourcesOn(graph: OrgGraph, personId: string, added: readonly OrgSource[]): OrgGraph['people'] {
  return graph.people.map(person => {
    if (person.id !== personId) return person
    const known = new Set(person.sources.map(source => source.id))
    return { ...person, sources: [...person.sources, ...added.filter(source => !known.has(source.id))] }
  })
}

export function applyRelationVerdict(
  graph: OrgGraph,
  args: {
    fromId: string
    toId: string
    type: OrgHierarchyRelation
    version: number
    verdict: RelationVerdict
    /**
     * QUAND cette vérification a lieu, en ISO — posée par l'APPELANT, jamais
     * lue d'une horloge ici (la fonction reste pure, comme ses sœurs).
     *
     * Sans elle, `verified: true` disait QUE quelqu'un avait affirmé le lien et
     * jamais QUAND : l'affirmation ne vieillissait pas, ce qui est faux d'un
     * rattachement. C'est cette date que `readVerifiedWithFreshness` fait
     * expirer — un fait périmé redevient inconnu AVEC sa date.
     */
    at: string
  },
): OrgGraph | null {
  const { fromId, toId, type, version, verdict, at } = args
  if (verdict.confidence === null || verdict.sources.length === 0) return null
  const sources = withDeclaredClaim(verdict.sources)

  const index = graph.hierarchyEdges.findIndex(e => e.fromId === fromId && e.toId === toId && e.type === type)
  if (index === -1) return promoteReportingHypothesis(graph, { fromId, toId, type, version, verdict, sources, at })

  const edge = graph.hierarchyEdges[index]!
  if (edge.verified) return null

  const sourceIds = [...new Set([...edge.sourceIds, ...sources.map(s => s.id)])]
  const hierarchyEdges = graph.hierarchyEdges.map((e, i) =>
    i === index
      ? {
          ...e,
          verified: verdict.verified,
          confidence: verdict.confidence!,
          sourceIds,
          // Une vérification NÉGATIVE n'est pas une vérification datée : elle
          // dit « on n'a pas su l'établir », pas « c'était vrai à cette date ».
          ...(verdict.verified ? { lastVerifiedAt: at } : {}),
        }
      : e,
  )

  // On la pose sur l'extrémité qui porte la relation — celle qui rapporte.
  const people = withSourcesOn(graph, fromId, sources)

  const parsed = orgGraphSchema.safeParse({ ...graph, graphVersion: version, hierarchyEdges, people })
  return parsed.success ? parsed.data : null
}

/**
 * Une hypothèse de rattachement confirmée devient une ligne de l'organigramme.
 *
 * Trois refus, et le second est le cliquet anti-P0 :
 *
 *  1. **aucune hypothèse** ne relie ces deux personnes sous le topic de
 *     rattachement — on ne fabrique pas la relation qu'on vérifie ;
 *  2. **aucune preuve n'ÉTAYE cette relation** — une preuve d'identité, de
 *     titre, de niveau ou d'appartenance n'a rien observé du lien entre deux
 *     personnes. Les preuves hors claim ne sont pas jetées pour autant : elles
 *     rejoignent le nœud, où elles prouvent ce qu'elles prouvent. C'est
 *     exactement l'arbitrage de `_honour_claims` côté assembleur ;
 *  3. le graphe résultant ne passe pas le contrat.
 *
 * ⚠️ **L'hypothèse n'est PAS retirée.** On archive, on ne supprime pas : elle
 * porte le raisonnement de l'analyse, et la carte préfère de toute façon la
 * ligne hiérarchique dès qu'il y en a une. La retirer serait par ailleurs sans
 * effet durable — l'assembleur la reproduit à chaque run depuis `reportingTo`.
 */
function promoteReportingHypothesis(
  graph: OrgGraph,
  args: {
    fromId: string
    toId: string
    type: OrgHierarchyRelation
    version: number
    verdict: RelationVerdict
    sources: OrgSource[]
    at: string
  },
): OrgGraph | null {
  const { fromId, toId, type, version, verdict, sources, at } = args
  // #4016 L4.2 — une arête INFÉRÉE des intitulés a, elle aussi, un sujet à vérifier ;
  // la porte du claim ci-dessous reste la seule qui en fasse une ligne.
  const supposed = [...orgReportingHypotheses(graph), ...orgInferredReportings(graph)].some(
    h => h.fromId === fromId && h.toId === toId,
  )
  if (!supposed) return null

  const backing = sources.filter(source => claimBacksOrgRelation(type, source.claim))
  if (backing.length === 0) return null

  const hierarchyEdges = [
    ...graph.hierarchyEdges,
    {
      fromId,
      toId,
      type,
      // ⚠️ SEULES les preuves qui ont observé le lien sont citées par la ligne.
      // Reprendre les `sourceIds` du nœud ferait cautionner un rattachement par
      // un enregistrement de fournisseur : le P0, mot pour mot.
      sourceIds: backing.map(source => source.id),
      confidence: verdict.confidence!,
      verified: verdict.verified,
      ...(verdict.verified ? { lastVerifiedAt: at } : {}),
    },
  ]
  const people = withSourcesOn(graph, fromId, sources)

  const parsed = orgGraphSchema.safeParse({ ...graph, graphVersion: version, hierarchyEdges, people })
  return parsed.success ? parsed.data : null
}
