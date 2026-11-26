import { applyFieldUpdates, type FieldSource } from './provenance.js'
import { orgRelationKey } from './org-freshness.js'
import type { OrgEntity, OrgGraph, OrgHierarchyEdge, OrgInfluenceEdge, OrgPerson } from './org-graph.js'

/* ------------------------------------------------------------------ */
/*  La fusion par DELTA du graphe d'organigramme                       */
/* ------------------------------------------------------------------ */

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LE PROBLÈME, MESURÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * Une vague d'enrichissement classe CINQUANTE personnes. Le service IA, lui,
 * réassemble le graphe ENTIER à partir de ce qu'on lui a envoyé, et
 * `saveOrgChart` écrasait le graphe stocké avec ce résultat. Sur AIRBUS
 * (2 241 contacts), une vague de 50 remplaçait donc un graphe de 2 241
 * personnes par un graphe de 50 : tout ce que les vagues précédentes avaient
 * appris disparaissait à la vague suivante. C'est ce que « chaque vague rejoue
 * 2 000 personnes » veut dire côté écran — le travail se défait aussi vite
 * qu'il se fait.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE FAIT CETTE FUSION
 * ─────────────────────────────────────────────────────────────────────────────
 * **Seul ce que la vague a touché est recalculé.** Le reste du graphe est
 * reconduit tel quel, à l'identité près. Concrètement :
 *
 * · une personne du graphe courant que la vague n'a pas vue ne bouge pas —
 *   ni son titre, ni son niveau, ni sa `lastVerifiedAt` ;
 * · une personne que la vague a vue est fusionnée CHAMP PAR CHAMP, via
 *   `applyFieldUpdates` ;
 * · une personne que la vague DÉCOUVRE est ajoutée ;
 * · une personne absente de la vague n'est jamais supprimée. **On archive, on
 *   ne supprime pas** — et de toute façon « absente d'un lot de 50 » ne veut
 *   rien dire sur une personne qui n'était pas dans le lot.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UNE CORRECTION HUMAINE GAGNE TOUJOURS
 * ─────────────────────────────────────────────────────────────────────────────
 * Toute écriture de champ passe par `applyFieldUpdates` / `decideFieldWrite`
 * (`provenance.ts`). Les champs qu'un humain a corrigés sont déclarés dans
 * `humanHeldFields` et portent `'human'`, strictement au-dessus de tout ce
 * qu'une vague peut proposer : ils ne sont jamais écrasés, quelle que soit la
 * date. Un delta qui écraserait une correction serait pire que le remplacement
 * complet qu'il remplace. (Le rang exact d'une vague, et pourquoi ce n'est pas
 * `model`, est expliqué sur {@link WAVE_SOURCE}.)
 *
 * Deux propriétés viennent gratuitement de `decideFieldWrite`, et elles comptent
 * ici plus qu'ailleurs :
 *  · **un blanc n'écrase jamais une valeur** — le modèle qui « oublie » le titre
 *    d'une personne ne l'efface pas ;
 *  · **`lastVerifiedAt` survit** — elle n'est pas dans les champs fusionnables,
 *    et une vague ne la produit pas : elle appartient au geste de vérification.
 *    La fraîcheur d'un fait vérifié traverse donc les vagues sans qu'on ait à
 *    l'y porter à la main.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA FUSION NE TOUCHE PAS, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 * `coverage`, `colouring` et `recommendedPath` décrivent le graphe ENTIER.
 * Calculés sur un lot de 50, ils sont FAUX pour le compte — écrire « 43
 * découverts » sur un dossier de 2 241 contacts est exactement le défaut
 * « un compteur uniforme sur des formes hétérogènes ». Sur un delta on garde
 * donc ceux du graphe courant ; le chemin, lui, a déjà son geste dédié et
 * déterministe (« Recalculer le chemin », zéro IA, zéro crédit).
 *
 * Sur un REMPLACEMENT COMPLET (`touchedPersonIds` vide), rien de tout cela ne
 * s'applique : la fonction rend le graphe entrant tel quel, ce qui est le
 * comportement d'avant ce lot, byte pour byte.
 */

/** Les champs d'une personne qu'un humain peut avoir posés (ledger de corrections). */
export type OrgHumanHeldFields = Readonly<Record<string, readonly string[]>>

export type OrgGraphDeltaInput = {
  /** Le graphe STOCKÉ. C'est lui qui fait foi partout où la vague n'est pas passée. */
  current: OrgGraph
  /** Ce que la vague vient de produire. */
  incoming: OrgGraph
  /**
   * Les personnes que la vague a réellement traitées, par id de graphe.
   *
   * VIDE = remplacement complet assumé (premier run, « Enrichir l'organigramme »
   * sur tout le compte). La fonction rend alors `incoming` tel quel : une
   * fusion sur un run complet n'aurait rien à protéger et masquerait les
   * suppressions légitimes.
   */
  touchedPersonIds: readonly string[]
  /** `personId` → champs qu'un humain a posés. Absent = aucune correction connue. */
  humanHeldFields?: OrgHumanHeldFields
}

/**
 * La source d'une vague d'enrichissement : `pipeline`.
 *
 * ⚠️ Et **pas** `model`, alors que la valeur sort bien d'un modèle. La raison
 * est le rang : `model` (1) est PLUS FAIBLE que `pipeline` (2), et le défaut
 * d'une valeur sans provenance enregistrée est justement `pipeline`
 * (`UNKNOWN_PROVENANCE_SOURCE`). Une vague déclarée `model` n'aurait donc jamais
 * pu corriger ce qu'une vague PRÉCÉDENTE avait écrit : elle n'aurait su que
 * remplir des trous, et une mauvaise classification serait restée pour toujours.
 *
 * `pipeline` est aussi ce que `contacts.service.ts` (`arbitrateEnrichment`)
 * déclare déjà pour la MÊME phase 3 sur les mêmes personnes : une seule autorité
 * pour un seul geste, plutôt que deux barèmes qui s'arbitreraient entre eux.
 *
 * Ce que ça préserve, et c'est tout ce qui compte : `human` (4) reste
 * strictement au-dessus. **Une correction humaine gagne toujours.**
 */
const WAVE_SOURCE: FieldSource = 'pipeline'

/** Les champs d'une personne qu'une vague a le droit de proposer. `id` et
 *  `fullName` n'y sont pas : ils IDENTIFIENT, ils ne se corrigent pas ici. */
const MERGEABLE_PERSON_FIELDS = [
  'title',
  'entityId',
  'family',
  'hierarchyLevel',
  'decisionRoles',
  'identityStatus',
  'confidence',
  'roleInferred',
] as const satisfies readonly (keyof OrgPerson)[]

/** Idem pour une entité — `id` et `name` identifient. */
const MERGEABLE_ENTITY_FIELDS = [
  'type',
  'parentId',
  'country',
  'status',
  'confidence',
] as const satisfies readonly (keyof OrgEntity)[]

function pick<T extends object, K extends readonly (keyof T)[]>(source: T, keys: K): Partial<T> {
  const out: Partial<T> = {}
  for (const key of keys) {
    if (source[key] !== undefined) out[key] = source[key]
  }
  return out
}

/**
 * Fusionne un objet champ par champ sous l'arbitrage de la provenance.
 *
 * Les champs listés dans `humanFields` portent `'human'` et sont donc
 * intouchables ; tous les autres retombent sur `UNKNOWN_PROVENANCE_SOURCE`
 * (`pipeline`), que la vague égale — elle a donc le droit de rafraîchir ce
 * qu'un run précédent avait écrit, et seulement ça.
 */
function mergeFields<T extends Record<string, unknown>>(
  current: T,
  incoming: Partial<T>,
  humanFields: readonly string[],
): T {
  const currentSources: Partial<Record<string, FieldSource>> = {}
  for (const field of humanFields) currentSources[field] = 'human'

  const { accepted } = applyFieldUpdates<T>({
    incoming,
    incomingSource: WAVE_SOURCE,
    current,
    currentSources: currentSources as Partial<Record<keyof T & string, FieldSource>>,
  })
  return { ...current, ...accepted }
}

/** La clé d'une influence : deux personnes ET un sujet — le même couple peut
 *  peser sur deux sujets différents, ce sont deux faits distincts. */
function influenceKey(edge: OrgInfluenceEdge): string {
  return `${edge.fromId}|${edge.topic}|${edge.toId}`
}

/**
 * Fusionne une vague dans le graphe stocké.
 *
 * Pure : aucune horloge, aucune base. Les deux graphes entrent validés, le
 * résultat est re-validable par `orgGraphSchema` (l'intégrité référentielle
 * tient parce qu'on n'enlève jamais de nœud).
 */
export function mergeOrgGraphDelta(input: OrgGraphDeltaInput): OrgGraph {
  const { current, incoming, touchedPersonIds } = input
  // Un run COMPLET reste un remplacement — chemin byte-identique à avant.
  if (touchedPersonIds.length === 0) return incoming

  const touched = new Set(touchedPersonIds)
  const humanHeld = input.humanHeldFields ?? {}

  // ── Entités ────────────────────────────────────────────────────────
  // Une vague peut nommer une entité que le graphe ne connaissait pas ; elle
  // n'en fait jamais disparaître une (une entité absente d'un lot de 50 n'est
  // pas une entité dissoute).
  const entities = current.entities.map(entity => {
    const found = incoming.entities.find(candidate => candidate.id === entity.id)
    return found ? mergeFields(entity, pick(found, MERGEABLE_ENTITY_FIELDS), []) : entity
  })
  const knownEntityIds = new Set(entities.map(entity => entity.id))
  for (const entity of incoming.entities) {
    if (!knownEntityIds.has(entity.id)) {
      entities.push(entity)
      knownEntityIds.add(entity.id)
    }
  }

  // ── Personnes ──────────────────────────────────────────────────────
  const people = current.people.map(person => {
    if (!touched.has(person.id)) return person
    const found = incoming.people.find(candidate => candidate.id === person.id)
    if (!found) return person
    return mergeFields(person, pick(found, MERGEABLE_PERSON_FIELDS), humanHeld[person.id] ?? [])
  })
  const knownPeopleIds = new Set(people.map(person => person.id))
  for (const person of incoming.people) {
    if (!knownPeopleIds.has(person.id)) {
      people.push(person)
      knownPeopleIds.add(person.id)
    }
  }

  // ── Arêtes ─────────────────────────────────────────────────────────
  // Ajout et mise à jour, jamais de retrait : retirer un lien est un GESTE
  // humain (correction `presence: absent`), pas l'effet de bord d'une vague
  // qui ne l'a simplement pas revu. Une arête dont un bout est inconnu du
  // graphe fusionné est écartée — elle violerait l'intégrité référentielle.
  const hierarchyByKey = new Map(current.hierarchyEdges.map(edge => [orgRelationKey(edge), edge]))
  for (const edge of incoming.hierarchyEdges) {
    if (!knownPeopleIds.has(edge.fromId) && !knownEntityIds.has(edge.fromId)) continue
    if (!knownPeopleIds.has(edge.toId) && !knownEntityIds.has(edge.toId)) continue
    const key = orgRelationKey(edge)
    const existing = hierarchyByKey.get(key)
    hierarchyByKey.set(key, existing ? mergeHierarchyEdge(existing, edge) : edge)
  }

  const influenceByKey = new Map(current.influenceEdges.map(edge => [influenceKey(edge), edge]))
  for (const edge of incoming.influenceEdges) {
    if (!knownPeopleIds.has(edge.fromId) && !knownEntityIds.has(edge.fromId)) continue
    if (!knownPeopleIds.has(edge.toId) && !knownEntityIds.has(edge.toId)) continue
    influenceByKey.set(influenceKey(edge), edge)
  }

  // ── Ce qui décrit le graphe ENTIER ────────────────────────────────
  // `coverage`, `colouring` et `recommendedPath` mesurés sur un lot de 50 sont
  // faux pour le compte : on garde ceux du graphe courant. Le comité et les
  // zones blanches, eux, se fusionnent par clé — ce sont des listes d'objets,
  // pas des compteurs.
  const committeeByPerson = new Map(current.buyingCommittee.map(seat => [seat.personId, seat]))
  for (const seat of incoming.buyingCommittee) {
    if (knownPeopleIds.has(seat.personId)) committeeByPerson.set(seat.personId, seat)
  }

  const zoneKey = (zone: OrgGraph['uncoveredZones'][number]) =>
    `${zone.entityId ?? ''}|${zone.family ?? ''}|${zone.hierarchyLevel ?? ''}`
  const zonesByKey = new Map(current.uncoveredZones.map(zone => [zoneKey(zone), zone]))
  for (const zone of incoming.uncoveredZones) zonesByKey.set(zoneKey(zone), zone)

  const rejectedById = new Map(current.rejectedItems.map(item => [item.sourceId, item]))
  for (const item of incoming.rejectedItems) {
    if (!rejectedById.has(item.sourceId)) rejectedById.set(item.sourceId, item)
  }

  // Un élément écarté ne peut pas rester un nœud vivant (invariant du schéma).
  const rejectedIds = new Set(rejectedById.keys())

  return {
    ...current,
    graphVersion: Math.max(current.graphVersion, incoming.graphVersion),
    promptHash: incoming.promptHash ?? current.promptHash,
    entities: entities.filter(entity => !rejectedIds.has(entity.id)),
    people: people.filter(person => !rejectedIds.has(person.id)),
    hierarchyEdges: [...hierarchyByKey.values()].filter(
      edge => !rejectedIds.has(edge.fromId) && !rejectedIds.has(edge.toId),
    ),
    influenceEdges: [...influenceByKey.values()].filter(
      edge => !rejectedIds.has(edge.fromId) && !rejectedIds.has(edge.toId),
    ),
    buyingCommittee: [...committeeByPerson.values()].filter(seat => !rejectedIds.has(seat.personId)),
    uncoveredZones: [...zonesByKey.values()],
    recommendedPath: current.recommendedPath.filter(step => !rejectedIds.has(step.personId)),
    rejectedItems: [...rejectedById.values()],
  }
}

/**
 * Une arête fusionnée. `verified` ne se DÉGRADE jamais par un delta : une vague
 * qui n'a pas revu la preuve n'a rien constaté, et « le modèle ne l'a pas
 * réaffirmé » n'est pas « ce n'est plus vrai ». C'est la FRAÎCHEUR
 * (`lastVerifiedAt` + `readVerifiedWithFreshness`) qui fait vieillir une
 * vérification, pas le silence d'un lot.
 */
function mergeHierarchyEdge(current: OrgHierarchyEdge, incoming: OrgHierarchyEdge): OrgHierarchyEdge {
  if (current.verified && !incoming.verified) return current
  return {
    ...incoming,
    // Les preuves s'accumulent : une source trouvée par une vague ne remplace
    // pas celles d'avant.
    sourceIds: [...new Set([...current.sourceIds, ...incoming.sourceIds])],
    // La date de vérification appartient au geste humain, jamais au modèle.
    lastVerifiedAt: current.lastVerifiedAt ?? incoming.lastVerifiedAt,
  }
}
