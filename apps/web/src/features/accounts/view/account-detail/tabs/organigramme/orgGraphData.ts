import {
  orgGraphSchema,
  partitionOrgHierarchy,
  type Contact,
  type OrgCommitteeMember,
  type OrgEntity,
  type OrgGraph,
  type OrgHierarchyEdge,
  type OrgInfluenceEdge,
  type OrgPerson,
  type OrgRecommendedStep,
  type OrgRelationalEdge,
  type OrgSource,
} from '@bellum/contracts'
import { filterOrgGraphByExcludedContacts } from './organigrammeData'

/**
 * Read-model for the Org Graph « 4 views » (Annexe Organigramme p5) — reads the
 * NEW `raw_analysis.org.orgGraph` the IA now emits and narrows it through the
 * contract parser. Additive: this is a distinct key from the legacy
 * `org.organigramme` the existing tab reads, so nothing that renders today
 * changes. Returns null when the graph is absent, invalid, or empty — the tab
 * then simply doesn't show the new section.
 *
 * The four views (contract header):
 *   1. organigramme vérifié → hierarchyEdges where verified === true
 *   2. carte d'influence    → influenceEdges (probabilistes)
 *   3. buying committee     → buyingCommittee
 *   4. chemin recommandé    → recommendedPath
 */
export type OrgGraphViewData = {
  graph: OrgGraph
  /** verified reporting lines only — the « organigramme vérifié » view. */
  verifiedEdges: OrgHierarchyEdge[]
  /** inferred (dotted) hierarchy lines — shown under the verified view, distinct. */
  inferredEdges: OrgHierarchyEdge[]
  influenceEdges: OrgInfluenceEdge[]
  committee: OrgCommitteeMember[]
  path: OrgRecommendedStep[]
  /** #2919/#2310.2 — les nœuds `equipe` du graphe, pour la vue « Équipes ». */
  teams: OrgEntity[]
  /** #2919/#2310.13-.21 — projet, blocage, mise en relation, workspace lié —
   *  pour la vue « Relations workspace ». */
  relationalEdges: OrgRelationalEdge[]
  /** id → display name resolvers (person + entity). */
  nameOf: (id: string) => string
  entityNameOf: (id: string | null | undefined) => string | null
  personOf: (id: string) => OrgPerson | undefined
  /** Les preuves derrière un lien : ses `sourceIds` résolus sur les `OrgSource`
   *  portés par les nœuds. Dédupliqué, ordre d'apparition, ids inconnus ignorés —
   *  une source qu'aucun nœud ne porte n'est pas une source (annexe p5). */
  sourcesOf: (sourceIds: readonly string[]) => OrgSource[]
  counts: { entities: number; people: number; verified: number; inferred: number; influence: number }
  /** Confiance globale du graphe (0-100), dérivée déterministe des confiances des
   *  nœuds — le « score » de la p19/p30. Recalculée à CHAQUE lecture depuis le
   *  graphe stocké : une correction qui élague un contact la met donc à jour
   *  immédiatement, sans relancer le pipeline (« recalculer le score sans full
   *  rerun », p30). `null` quand le graphe ne porte aucun nœud à moyenner. */
  graphConfidence: number | null
  /**
   * La carte est-elle majoritairement DEVINÉE ? — voir {@link MOSTLY_INFERRED_RATIO}.
   *
   * `null` quand il n'y a aucun lien hiérarchique : un graphe vide n'a rien
   * inventé, et « je ne sais pas » n'est pas « je devine ».
   */
  mostlyInferred: boolean | null
  /** Aucun lien hiérarchique, prouvé ni supposé — la vue s'annonce alors comme
   *  une carte de contacts. Voir {@link hasNoProvenHierarchy}. */
  noProvenHierarchy: boolean
}

/**
 * Confiance globale du graphe : la moyenne des confiances des PERSONNES (les
 * nœuds qui décident), à défaut celle des entités. Chaque confiance de nœud est
 * déjà le produit de la formule p14 ; les agréger donne la fiabilité d'ensemble
 * que l'écran affiche en « X/100 ».
 *
 * Déterministe et PUR : recalculé à chaque rendu depuis le graphe stocké. Rien
 * n'est inventé — un graphe sans nœud à moyenner rend `null`, jamais un zéro qui
 * se lirait « aucune confiance ».
 */
export function computeGraphConfidence(graph: OrgGraph): number | null {
  const pool = graph.people.length > 0 ? graph.people : graph.entities
  if (pool.length === 0) return null
  const sum = pool.reduce((acc, node) => acc + node.confidence, 0)
  return Math.round(sum / pool.length)
}

/**
 * La part de liens DEVINÉS au-delà de laquelle la carte se déclare telle quelle.
 *
 * ⚠️ CE QUE CETTE CONSTANTE N'EST PAS — corrigé le 29/08.
 *
 * Le docbloc précédent affirmait « restauré depuis la spécification du 21/08,
 * qui l'écrivait comme un garde-fou d'honnêteté : ≥ 60 % de nœuds gris sur un
 * organigramme non enrichi ». Le NOMBRE avait survécu ; la RÈGLE, non. Trois
 * choses avaient changé en chemin :
 *
 *   · le NUMÉRATEUR — la source compte des NŒUDS gris, ce code comptait des
 *     ARÊTES inférées ;
 *   · le DÉNOMINATEUR — la source parle des personnes d'un graphe NON ENRICHI,
 *     ce code parle de tous les liens hiérarchiques ;
 *   · le SENS — la source pose un PLANCHER sur le GÉNÉRATEUR (« si le
 *     générateur colore plus, il invente »), ce code posait un PLAFOND
 *     D'ÉTIQUETTE au LECTEUR.
 *
 * Le coût mesuré : un graphe dont 100 % des liens sont officiels n'affichait
 * aucune mention, tout en colorant 100 % des personnes d'un rôle de décision
 * déduit de leur titre. La phrase la plus fausse de l'écran était silencieuse,
 * et celle qui parlait ne portait pas sur le bon objet.
 *
 * La vraie règle vit désormais dans le GÉNÉRATEUR —
 * `apps/ia/app/services/org_graph_colouring.py`, gardée par
 * `apps/ia/tests/test_org_grey_floor.py` — avec le bon numérateur, le bon
 * dénominateur et le bon sens. Elle voyage avec le graphe (`orgColouringSchema`)
 * et l'écran la LIT (`focalOrgData.measureGeneratorColouring`). Une correction
 * intermédiaire l'avait posée côté web ; c'était encore la mauvaise adresse, un
 * plancher qui accuse le générateur ne peut pas être calculé par le lecteur.
 *
 * Ce seuil-ci RESTE, parce que ce qu'il dit est vrai et utile — simplement, il
 * dit autre chose : une carte entièrement composée d'hypothèses à 65 affichait
 * « Confiance 65/100 », un chiffre exact et une lecture fausse. Il se lit
 * « plutôt fiable » là où il faut lire « je devine presque tout », et c'est sur
 * cette carte qu'on décide qui appeler en premier. Deux garde-fous distincts,
 * sur deux objets distincts, qui partagent un nombre par coïncidence.
 */
export const MOSTLY_INFERRED_RATIO = 0.6

/**
 * La carte est-elle majoritairement devinée ?
 *
 * `null` quand il n'y a aucun lien hiérarchique : « je ne sais pas » n'est pas
 * « je devine » — un graphe vide n'a rien inventé.
 */
export function isMostlyInferred(verified: number, inferred: number): boolean | null {
  const total = verified + inferred
  if (total === 0) return null
  return inferred / total >= MOSTLY_INFERRED_RATIO
}

/**
 * La carte ne porte-t-elle AUCUN lien hiérarchique prouvé ni même supposé ?
 *
 * ⚠️ Distinct de {@link isMostlyInferred}, qui répond « ce que je montre, je
 * l'ai deviné » et rend `null` à zéro lien — « je ne sais pas » n'est pas « je
 * devine ». Vrai pour une ARÊTE ; faux pour la VUE, qui continue d'empiler des
 * paliers Direction / Management / Opérationnel tirés des seuls intitulés.
 *
 * Mesuré le 03/09/2026 sur le run KNDS (293 personnes, zéro lien managérial —
 * Apollo n'en fournit aucun) : la carte la plus muette du produit était la seule
 * à ne rien déclarer. Ici on nomme ce cas pour que la vue s'annonce comme une
 * CARTE DE CONTACTS et non comme un organigramme — le repli que le prompt
 * `bellum_organigramme` prévoit déjà côté serveur.
 *
 * Sans personne, il n'y a pas de carte à corriger : l'état vide a son écran.
 */
export function hasNoProvenHierarchy({
  people,
  verified,
  inferred,
}: {
  people: number
  verified: number
  inferred: number
}): boolean {
  return people > 0 && verified === 0 && inferred === 0
}

/** Palier de confiance p14 (encadré SEUILS). Un lien non vérifié ne peut PAS
 *  monter au-dessus de « probable », quel que soit son score — la vérification
 *  demande une preuve, pas un chiffre élevé (invariant du contrat). */
type ConfidenceTier = 'verified' | 'probable' | 'hypothesis'
export function confidenceTier(confidence: number, verified: boolean): ConfidenceTier {
  if (verified) return 'verified'
  return confidence >= 70 ? 'probable' : 'hypothesis'
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

/**
 * Résout les `sourceIds` d'un edge en preuves réelles.
 *
 * Les `OrgSource` vivent INLINE sur les nœuds (entités et personnes) ; un edge
 * ne porte que des identifiants. Un id qu'aucun nœud ne porte n'est pas une
 * preuve — on le laisse tomber plutôt que d'afficher une référence creuse.
 *
 * Une seule dérivation, un seul endroit : les quatre vues et la carte
 * d'influence lisent le MÊME index. Deux résolveurs qui divergeraient
 * feraient dire à un lien « sourcé » sur un écran et « hypothèse » sur l'autre.
 */
export function orgSourceResolver(graph: OrgGraph): (sourceIds: readonly string[]) => OrgSource[] {
  const sourceById = new Map<string, OrgSource>()
  for (const node of [...graph.entities, ...graph.people]) {
    for (const source of node.sources) if (!sourceById.has(source.id)) sourceById.set(source.id, source)
  }
  return (sourceIds: readonly string[]): OrgSource[] => {
    const seen = new Set<string>()
    const out: OrgSource[] = []
    for (const id of sourceIds) {
      if (seen.has(id)) continue
      const source = sourceById.get(id)
      if (!source) continue
      seen.add(id)
      out.push(source)
    }
    return out
  }
}

export function buildOrgGraphViewData(
  rawAnalysis: Record<string, unknown> | null | undefined,
  /** #3742/#3744 (reste) — les contacts du dossier, pour retirer du graphe les
   *  personnes dont le contact est écarté (même filtre géographique que
   *  l'onglet Contacts). Absent = comportement inchangé, graphe tel que stocké. */
  contacts?: readonly Contact[],
): OrgGraphViewData | null {
  const root = readRecord(rawAnalysis) ?? {}
  const org = readRecord(root['org']) ?? root
  const candidate = org['orgGraph']
  if (!candidate) return null

  const parsed = orgGraphSchema.safeParse(candidate)
  if (!parsed.success) {
    // #2755.1 — un graphe PRÉSENT mais qui échoue le contrat rendait `null`,
    // EXACTEMENT comme un dossier jamais analysé : « pas encore construit »
    // n'est pas la même phrase que « l'IA a produit un graphe, le contrat
    // le refuse ». Un dossier « Terminé » avec un `orgGraph` invalide
    // s'affichait donc à l'identique d'un dossier vide — invérifiable, même
    // au code, sans relire la base. Ne loggue que le CHEMIN et le CODE de
    // chaque violation Zod : jamais un `message` ni une valeur — ce graphe
    // porte des noms de personnes réels (PII, RGPD).
    console.error(
      'orgGraph présent mais invalide (contrat rejeté) — graphe traité comme vide',
      parsed.error.issues.map(issue => ({ path: issue.path.join('.'), code: issue.code })),
    )
    return null
  }
  const graph = contacts ? filterOrgGraphByExcludedContacts(parsed.data, contacts) : parsed.data

  // Nothing meaningful to show → let the tab omit the section entirely.
  if (graph.people.length === 0 && graph.entities.length === 0) return null

  const peopleById = new Map<string, OrgPerson>(graph.people.map(p => [p.id, p]))
  const entityById = new Map<string, OrgEntity>(graph.entities.map(e => [e.id, e]))

  const nameOf = (id: string): string => peopleById.get(id)?.fullName ?? entityById.get(id)?.name ?? id
  const entityNameOf = (id: string | null | undefined): string | null =>
    id ? (entityById.get(id)?.name ?? null) : null

  const sourcesOf = orgSourceResolver(graph)

  // Le partage « prouvé / hypothèse » vient du CONTRAT (D38) : trois chemins le
  // refaisaient, et deux dérivations qui se ressemblent finissent par diverger.
  const { verified: verifiedEdges, inferred: inferredEdges } = partitionOrgHierarchy(graph.hierarchyEdges)

  return {
    graph,
    verifiedEdges,
    inferredEdges,
    influenceEdges: graph.influenceEdges,
    committee: graph.buyingCommittee,
    path: [...graph.recommendedPath].sort((a, b) => a.step - b.step),
    teams: graph.entities.filter(entity => entity.type === 'equipe'),
    relationalEdges: graph.relationalEdges,
    nameOf,
    entityNameOf,
    personOf: (id: string) => peopleById.get(id),
    sourcesOf,
    counts: {
      entities: graph.entities.length,
      people: graph.people.length,
      verified: verifiedEdges.length,
      inferred: inferredEdges.length,
      influence: graph.influenceEdges.length,
    },
    graphConfidence: computeGraphConfidence(graph),
    mostlyInferred: isMostlyInferred(verifiedEdges.length, inferredEdges.length),
    noProvenHierarchy: hasNoProvenHierarchy({
      people: graph.people.length,
      verified: verifiedEdges.length,
      inferred: inferredEdges.length,
    }),
  }
}
