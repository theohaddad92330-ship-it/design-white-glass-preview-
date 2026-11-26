import {
  orgLinkOrigin as contractLinkOrigin,
  orgNodeRefinedKind,
  type EntityKind,
  type OrgDecisionRole,
  type OrgEntityStatus,
  type OrgEntityType,
  type OrgGraph,
  type OrgHierarchyLevel,
  type OrgIdentityStatus,
  type OrgLinkNature,
  type OrgLinkOrigin,
  type OrgSource,
  type OrgZoneImportance,
} from '@bellum/contracts'
import { orgSourceResolver } from './orgGraphData'

/**
 * Read-model de la CARTE D'INFLUENCE STRUCTURELLE (annexe Organigramme p20,
 * « Organigramme cible BellumAI — hierarchy + entités + influence »).
 *
 * L'écran dessinait jusqu'ici une pyramide de PERSONNES triées par rôle d'achat :
 * pas d'entité, pas de niveau, pas de confiance sur le nœud. La maquette p20
 * décrit l'inverse — un graphe dont la rangée du haut est le groupe, la rangée
 * suivante les entités/BU, et sous chaque entité une colonne de postes, chaque
 * nœud portant SON pourcentage de confiance et SON badge de niveau.
 *
 * Ce module transforme l'`OrgGraph` déjà émis (entities[].parentId, people[]
 * .entityId / hierarchyLevel / family / confidence, hierarchyEdges, uncoveredZones)
 * en ce plan de dessin. Il est PUR : aucune donnée n'y est complétée.
 *
 *   · une personne sans `entityId` n'est rattachée à personne — elle part dans
 *     une colonne « rattachement inconnu », sans trait ;
 *   · une personne sans niveau ni rôle n'a pas de catégorie : `unknown` ;
 *   · une zone blanche qui ne nomme aucune entité n'a pas de place dans l'arbre :
 *     elle reste sur l'onglet Zones blanches plutôt que d'être posée au hasard ;
 *   · le trait entre deux nœuds vient TOUJOURS d'un champ du graphe (`parentId`,
 *     `entityId`, un `member_of` ou un `reports_to`), jamais d'une position.
 */

/** Les 4 catégories de couleur de la légende p20 (+ `unknown`, qui n'en est pas
 *  une : c'est l'aveu que le graphe ne situe pas la personne). */
export type OrgMapCategory = 'sponsor' | 'entity' | 'field' | 'procurement' | 'unknown'

export type OrgMapEntityNode = {
  id: string
  name: string
  type: OrgEntityType
  /** #2284.5-.9 — le kind qui AFFINE le type, sinon `null` (GA-26 : un badge). */
  kind: EntityKind | null
  status: OrgEntityStatus
  confidence: number
  /** Métiers RÉELLEMENT présents sous cette entité — le sous-titre de la maquette
   *  (« Graph:ID, MarTech, CRM »). Vide quand aucune personne n'y porte de famille. */
  families: string[]
  /** Pays vérifié de l'entité (ontologie p6 : « ownership / statut / pays vérifiés »).
   *  `null` quand le graphe ne le porte pas — on ne présume pas la France. */
  country: string | null
  /** Les preuves derrière ce nœud. « Chaque nœud porte source, date, statut et
   *  confiance » (DoD p32) : sans elles, la confiance est un chiffre sans appui. */
  sources: OrgSource[]
}

export type OrgMapPersonNode = {
  id: string
  fullName: string
  title: string | null
  level: OrgHierarchyLevel | null
  family: string | null
  category: OrgMapCategory
  confidence: number
  decisionRoles: OrgDecisionRole[]
  /** Où en est cette identité dans la machine à états p15 (seed → actionable,
   *  `historical` = capteur/ex-employé). Le nœud le DIT au lieu de laisser croire
   *  que toute personne affichée est également fiable. */
  identityStatus: OrgIdentityStatus
  sources: OrgSource[]
  /** Projets/sujets où cette personne pèse (les `topic` des influenceEdges qui la
   *  touchent). C'est l'axe « projet » de l'exploration p20 — vide quand le graphe
   *  ne lui connaît aucune influence. */
  projects: string[]
}

/** Un poste SANS personne : le trou de couverture, placé à sa place hiérarchique
 *  (p20 « Contact(s) à vérifier »). C'est le pont entre l'organigramme et les
 *  zones blanches, que l'écran rangeait dans un autre onglet, sans position. */
export type OrgMapGapNode = {
  id: string
  entityId: string
  reason: string
  family: string | null
  level: OrgHierarchyLevel | null
  importance: OrgZoneImportance
  suggestedTitles: string[]
  /** Les recherches à lancer pour combler le trou (p18 « Recherche »). */
  suggestedQueries: string[]
  /** Stock estimé de profils disponibles (p18 « Stock estimé : 30 profils Apollo
   *  potentiels »). `null` = le graphe ne l'estime pas ; on n'affiche alors aucun
   *  chiffre plutôt qu'un zéro qui se lirait « il n'y a personne ». */
  estimatedAvailable: number | null
}

export type OrgMapLink = {
  fromId: string
  toId: string
  /** D'où vient le trait — c'est ce qui décide de son style ET de sa légende.
   *  Le vocabulaire est celui du contrat, pas une copie locale (D38). */
  nature: OrgLinkNature
  /** Trait plein. Un `member_of`/`reports_to` n'est plein que si le graphe l'a
   *  déclaré vérifié (sourcé + ≥ 90) ; l'appartenance structurelle l'est par nature. */
  verified: boolean
  /** Score du lien inféré, `null` quand le graphe ne porte pas d'edge pour ce
   *  rattachement — on trace alors le trait sans afficher de score inventé. */
  confidence: number | null
  /** Les preuves du LIEN lui-même — ses `sourceIds` résolus sur les `OrgSource`
   *  réellement émises. Vide quand le graphe n'en cite aucune, ou quand celles
   *  qu'il cite ne retombent sur rien : le trait est alors une hypothèse et il
   *  le DIT, il ne reçoit pas une provenance fabriquée. */
  sources: OrgSource[]
  /** #2121.37 — QUAND le lien a été vérifié (`hierarchyEdge.lastVerifiedAt`).
   *  Absent = jamais vérifié, et l'écran l'écrit en toutes lettres. */
  lastVerifiedAt?: string | null
}

/**
 * Ce qu'un trait a le droit de dire de lui-même — la RÈGLE vit au contrat.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE POINT D'ENTRÉE RESTE ICI
 * ─────────────────────────────────────────────────────────────────────────
 * Le trait est l'objet sur lequel le commercial DÉCIDE : c'est lui qui affirme
 * « cette personne dépend de celle-là », donc « c'est elle qu'il faut appeler
 * d'abord ». Un rattachement déduit lu comme un fait envoie au mauvais
 * interlocuteur en donnant l'assurance du contraire. La règle qui en décide
 * était écrite ici, et une deuxième fois dans le read-model des quatre vues :
 * elle n'existe plus qu'à un endroit, {@link contractLinkOrigin} (D38 du 28/08).
 *
 * Ce qui reste ici est la LIAISON entre le trait dessiné (`OrgMapLink`) et la
 * règle : le modèle du trait est ce dépôt-ci, et c'est ici que GA-50 vérifie
 * qu'aucun trait ne se dessine sans dire ce qu'il affirme.
 */
export function orgLinkOrigin(link: OrgMapLink): OrgLinkOrigin {
  return contractLinkOrigin(link)
}

export type OrgMapColumn = {
  /** `null` = la colonne des personnes que le graphe ne rattache à aucune entité. */
  entity: OrgMapEntityNode | null
  isRoot: boolean
  people: OrgMapPersonNode[]
  gaps: OrgMapGapNode[]
}

export type OrgInfluenceMapData = {
  roots: OrgMapEntityNode[]
  columns: OrgMapColumn[]
  links: OrgMapLink[]
  /** Les axes d'exploration de la p20 (« groupe, entité, métier, niveau ») —
   *  uniquement ceux que la donnée porte réellement. */
  facets: {
    entities: Array<{ id: string; name: string }>
    families: string[]
    levels: OrgHierarchyLevel[]
    /** Rôles d'achat réellement portés (DoD p32 : filtrer par rôle). `unknown`
     *  en est exclu : filtrer sur « on ne sait pas » ne dit rien au commercial. */
    roles: OrgDecisionRole[]
    /** Projets/sujets d'influence réellement nommés (DoD p32 : filtrer par projet).
     *  Ce sont les `topic` des influenceEdges — « qui pèse sur Graph:ID ». */
    projects: string[]
  }
}

type OrgMapFilters = {
  entityId?: string | null
  family?: string | null
  level?: OrgHierarchyLevel | null
  role?: OrgDecisionRole | null
  /** Projet/sujet d'influence (p20). Ne garde que les personnes qui pèsent
   *  dessus ; comme le rôle, un trou de couverture n'en porte aucun et sort. */
  project?: string | null
  /** Seuil de confiance (DoD p32). Les personnes sous le seuil sortent ; les zones
   *  blanches RESTENT — un trou n'est pas une affirmation peu sûre, c'est une
   *  absence, et la masquer donnerait une carte faussement complète. */
  minConfidence?: number | null
  /** #2121.24 — retrouver une personne par son NOM. Comme le rôle, un trou de
   *  couverture n'a pas de nom : il sort. */
  name?: string | null
}

/** Casse et accents pliés : « chloe » retrouve « Chloé » (un `includes` brut ne
 *  plie ni l'un ni l'autre, et « aucune personne » serait un faux vide). */
function foldName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

const LEVEL_ORDER: OrgHierarchyLevel[] = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5']

function levelRank(level: OrgHierarchyLevel | null): number {
  return level ? LEVEL_ORDER.indexOf(level) : LEVEL_ORDER.length
}

/**
 * La catégorie de couleur d'une personne (légende p20). Elle est DÉDUITE de deux
 * champs réels — le rôle d'achat et le niveau structurel — dans cet ordre :
 * achats (rôle explicite ou L5) → budget/sponsor (décideur économique ou L0/L1)
 * → relais terrain (L2-L4). Aucune des deux données ⇒ `unknown`, et le nœud
 * s'affiche neutre : la carte dit qu'elle ne sait pas situer la personne.
 */
function categoryOf(roles: OrgDecisionRole[], level: OrgHierarchyLevel | null): OrgMapCategory {
  if (roles.includes('procurement') || level === 'L5') return 'procurement'
  if (roles.includes('economic_buyer') || level === 'L0' || level === 'L1') return 'sponsor'
  if (level === 'L2' || level === 'L3' || level === 'L4') return 'field'
  return 'unknown'
}

export function buildOrgInfluenceMap(graph: OrgGraph): OrgInfluenceMapData | null {
  // Pas d'entité = aucune structure connue. On ne fabrique pas un groupe fictif
  // pour avoir une racine : le rendu plat existant reste alors le seul honnête.
  if (graph.entities.length === 0) return null

  const entityById = new Map(graph.entities.map(e => [e.id, e]))
  const childrenOf = new Map<string, string[]>()
  const rootIds: string[] = []
  for (const entity of graph.entities) {
    const parentId = entity.parentId && entityById.has(entity.parentId) ? entity.parentId : null
    if (parentId && parentId !== entity.id) childrenOf.set(parentId, [...(childrenOf.get(parentId) ?? []), entity.id])
    else rootIds.push(entity.id)
  }

  // Ordre de lecture des colonnes : parcours en largeur depuis les racines, pour
  // qu'une BU soit dessinée juste après le nœud qui la contient.
  const ordered: string[] = []
  const queue = [...rootIds]
  const seen = new Set<string>(queue)
  while (queue.length > 0) {
    const id = queue.shift()!
    ordered.push(id)
    for (const child of childrenOf.get(id) ?? []) {
      if (seen.has(child)) continue
      seen.add(child)
      queue.push(child)
    }
  }
  // Une entité dont le parent forme un cycle n'entre pas dans le parcours : on la
  // garde quand même, en fin de rangée, plutôt que de la faire disparaître.
  for (const entity of graph.entities) if (!seen.has(entity.id)) ordered.push(entity.id)

  // Projets/sujets par personne : les `topic` des influenceEdges qui la touchent
  // (comme `from` ou comme `to`). C'est la matière de l'axe « projet » (p20).
  const projectsByPerson = new Map<string, Set<string>>()
  for (const edge of graph.influenceEdges) {
    const topic = edge.topic.trim()
    if (!topic) continue
    for (const id of [edge.fromId, edge.toId]) {
      const set = projectsByPerson.get(id) ?? new Set<string>()
      set.add(topic)
      projectsByPerson.set(id, set)
    }
  }

  const peopleByEntity = new Map<string, OrgMapPersonNode[]>()
  const unassigned: OrgMapPersonNode[] = []
  const familiesByEntity = new Map<string, string[]>()
  const renderedPeople = new Set<string>()

  for (const person of graph.people) {
    const level = person.hierarchyLevel ?? null
    const family = person.family?.trim() || null
    const node: OrgMapPersonNode = {
      id: person.id,
      fullName: person.fullName,
      title: person.title?.trim() || null,
      level,
      family,
      category: categoryOf(person.decisionRoles, level),
      confidence: person.confidence,
      decisionRoles: person.decisionRoles,
      identityStatus: person.identityStatus,
      sources: person.sources,
      projects: [...(projectsByPerson.get(person.id) ?? [])].sort((a, b) => a.localeCompare(b)),
    }
    renderedPeople.add(person.id)
    const entityId = person.entityId && entityById.has(person.entityId) ? person.entityId : null
    if (!entityId) {
      unassigned.push(node)
      continue
    }
    peopleByEntity.set(entityId, [...(peopleByEntity.get(entityId) ?? []), node])
    if (family) {
      const known = familiesByEntity.get(entityId) ?? []
      if (!known.includes(family)) familiesByEntity.set(entityId, [...known, family])
    }
  }

  for (const list of peopleByEntity.values()) {
    list.sort(
      (a, b) =>
        levelRank(a.level) - levelRank(b.level) || b.confidence - a.confidence || a.fullName.localeCompare(b.fullName),
    )
  }

  const gapsByEntity = new Map<string, OrgMapGapNode[]>()
  graph.uncoveredZones.forEach((zone, index) => {
    // Sans entité nommée, la zone n'a pas de place dans l'arbre. On préfère ne pas
    // la montrer ici que la poser sous une entité choisie au hasard.
    if (!zone.entityId || !entityById.has(zone.entityId)) return
    const gap: OrgMapGapNode = {
      id: `zone-${index}`,
      entityId: zone.entityId,
      reason: zone.reason,
      family: zone.family?.trim() || null,
      level: zone.hierarchyLevel ?? null,
      importance: zone.importance,
      suggestedTitles: zone.suggestedTitles,
      suggestedQueries: zone.suggestedQueries,
      estimatedAvailable: typeof zone.estimatedAvailable === 'number' ? zone.estimatedAvailable : null,
    }
    gapsByEntity.set(zone.entityId, [...(gapsByEntity.get(zone.entityId) ?? []), gap])
  })

  const entityNode = (id: string): OrgMapEntityNode => {
    const entity = entityById.get(id)!
    return {
      id: entity.id,
      name: entity.name,
      type: entity.type,
      kind: orgNodeRefinedKind(entity),
      status: entity.status,
      confidence: entity.confidence,
      families: familiesByEntity.get(id) ?? [],
      country: entity.country?.trim() || null,
      sources: entity.sources,
    }
  }

  const rootSet = new Set(rootIds)
  const columns: OrgMapColumn[] = ordered.map(id => ({
    entity: entityNode(id),
    isRoot: rootSet.has(id),
    people: peopleByEntity.get(id) ?? [],
    gaps: gapsByEntity.get(id) ?? [],
  }))
  if (unassigned.length > 0) columns.push({ entity: null, isRoot: false, people: unassigned, gaps: [] })

  // ── Traits ────────────────────────────────────────────────────────────────
  // Chacun vient d'un champ du graphe. Un `member_of` du graphe apporte en plus
  // son statut et son score ; sans edge correspondant, le rattachement reste vrai
  // (c'est `entityId` qui le porte) mais sans score : on ne montre pas de chiffre.
  // Les preuves d'un edge vivent sur les nœuds ; le résolveur est celui des
  // quatre vues, pour qu'un même lien ne puisse pas se dire « sourcé » ici et
  // « hypothèse » là-bas.
  const sourcesOf = orgSourceResolver(graph)
  const memberEdge = new Map<string, { verified: boolean; confidence: number; sources: OrgSource[] }>()
  const links: OrgMapLink[] = []
  for (const edge of graph.hierarchyEdges) {
    if (edge.type === 'member_of' && renderedPeople.has(edge.fromId) && entityById.has(edge.toId)) {
      memberEdge.set(`${edge.fromId}|${edge.toId}`, {
        verified: edge.verified,
        confidence: edge.confidence,
        sources: sourcesOf(edge.sourceIds),
      })
    }
    if (edge.type === 'reports_to' && renderedPeople.has(edge.fromId) && renderedPeople.has(edge.toId)) {
      links.push({
        fromId: edge.toId,
        toId: edge.fromId,
        nature: 'reports_to',
        verified: edge.verified,
        confidence: edge.confidence,
        sources: sourcesOf(edge.sourceIds),
        // La clé n'existe que si le graphe porte une date : un lien non daté
        // garde exactement sa forme d'avant.
        ...(edge.lastVerifiedAt ? { lastVerifiedAt: edge.lastVerifiedAt } : {}),
      })
    }
    // #2121.34 — `works_with` : Personne <-> Personne, HORS hiérarchie. Le
    // sens `fromId`/`toId` n'affirme rien (voir `orgHierarchyRelationSchema`) ;
    // il est conservé tel quel, comme les autres natures.
    if (edge.type === 'works_with' && renderedPeople.has(edge.fromId) && renderedPeople.has(edge.toId)) {
      links.push({
        fromId: edge.fromId,
        toId: edge.toId,
        nature: 'works_with',
        verified: edge.verified,
        confidence: edge.confidence,
        sources: sourcesOf(edge.sourceIds),
        ...(edge.lastVerifiedAt ? { lastVerifiedAt: edge.lastVerifiedAt } : {}),
      })
    }
  }

  // #2121.32 — une influence probabiliste (`influenceEdges`) devient un trait
  // dessinable : jusqu'ici, seul son `topic` alimentait `person.projects`
  // (ci-dessus) — le LIEN lui-même n'existait nulle part dans `links[]`.
  // Toujours `verified: false` : une influence est une INFÉRENCE par nature
  // (`orgInfluenceEdgeSchema`, D405), jamais un fait sourcé au sens strict.
  for (const edge of graph.influenceEdges) {
    if (!renderedPeople.has(edge.fromId) || !renderedPeople.has(edge.toId)) continue
    links.push({
      fromId: edge.fromId,
      toId: edge.toId,
      nature: 'influences',
      verified: false,
      confidence: edge.confidence,
      sources: sourcesOf(edge.sourceIds),
    })
  }

  for (const id of ordered) {
    const parentId = entityById.get(id)?.parentId
    if (parentId && entityById.has(parentId) && parentId !== id) {
      // L'arbre des entités vient de `parentId`, pas d'un edge : aucune preuve
      // ne lui est attachée, et on ne lui prête pas celles de l'entité — ce
      // serait faire dire à une source qu'elle prouve le lien alors qu'elle ne
      // prouve que le nœud.
      links.push({ fromId: parentId, toId: id, nature: 'entity_tree', verified: true, confidence: null, sources: [] })
    }
  }

  for (const [entityId, list] of peopleByEntity) {
    for (const person of list) {
      const edge = memberEdge.get(`${person.id}|${entityId}`)
      links.push({
        fromId: entityId,
        toId: person.id,
        nature: 'member_of',
        verified: edge?.verified ?? false,
        confidence: edge?.confidence ?? null,
        sources: edge?.sources ?? [],
      })
    }
  }

  const families = [
    ...new Set([
      ...graph.people.flatMap(p => (p.family?.trim() ? [p.family.trim()] : [])),
      ...graph.uncoveredZones.flatMap(z => (z.family?.trim() ? [z.family.trim()] : [])),
    ]),
  ].sort((a, b) => a.localeCompare(b))

  const levels = [
    ...new Set([
      ...graph.people.flatMap(p => (p.hierarchyLevel ? [p.hierarchyLevel] : [])),
      ...graph.uncoveredZones.flatMap(z => (z.hierarchyLevel ? [z.hierarchyLevel] : [])),
    ]),
  ].sort((a, b) => levelRank(a) - levelRank(b))

  const roles = [...new Set(graph.people.flatMap(p => p.decisionRoles))]
    .filter(role => role !== 'unknown')
    .sort((a, b) => a.localeCompare(b))

  const projects = [...new Set(graph.influenceEdges.flatMap(e => (e.topic.trim() ? [e.topic.trim()] : [])))].sort(
    (a, b) => a.localeCompare(b),
  )

  return {
    roots: rootIds.map(entityNode),
    columns,
    links,
    facets: {
      entities: ordered.map(id => ({ id, name: entityById.get(id)!.name })),
      families,
      levels,
      roles,
      projects,
    },
  }
}

/**
 * « Explorer par groupe, entité, métier, niveau » (p20). Filtrer NE CACHE JAMAIS
 * un trait dont les deux extrémités sont encore là, et ne laisse jamais un trait
 * pointer vers un nœud retiré — un lien orphelin se lirait comme un rattachement
 * à un nœud invisible.
 */
export function filterOrgInfluenceMap(map: OrgInfluenceMapData, filters: OrgMapFilters): OrgInfluenceMapData {
  const { entityId, family, level, role, project, minConfidence } = filters
  const name = filters.name ? foldName(filters.name) : ''
  if (!entityId && !family && !level && !role && !project && !minConfidence && !name) return map

  // Filtre entité = zoom sur une branche : on garde la colonne visée avec son
  // contenu, et ses ancêtres comme simple structure (le chemin qui y mène).
  const ancestors = new Set<string>()
  if (entityId) {
    const parentOf = new Map<string, string | null>()
    for (const link of map.links) if (link.nature === 'entity_tree') parentOf.set(link.toId, link.fromId)
    let cursor: string | null | undefined = entityId
    const guard = new Set<string>()
    while (cursor && !guard.has(cursor)) {
      guard.add(cursor)
      cursor = parentOf.get(cursor) ?? null
      if (cursor) ancestors.add(cursor)
    }
  }

  const keepsPerson = (person: OrgMapPersonNode) =>
    (!name || foldName(person.fullName).includes(name)) &&
    (!family || person.family === family) &&
    (!level || person.level === level) &&
    (!role || person.decisionRoles.includes(role)) &&
    (!project || person.projects.includes(project)) &&
    (!minConfidence || person.confidence >= minConfidence)
  // Une zone blanche ne porte ni rôle d'achat, ni projet, ni confiance : filtrer
  // sur le rôle OU le projet la retire (elle ne peut pas répondre à la question
  // posée), filtrer sur la confiance la garde (c'est une absence, pas une
  // affirmation fragile).
  const keepsGap = (gap: OrgMapGapNode) =>
    (!family || gap.family === family) && (!level || gap.level === level) && !role && !project && !name

  const columns = map.columns.flatMap<OrgMapColumn>(column => {
    const id = column.entity?.id ?? null
    if (entityId) {
      if (id && ancestors.has(id)) return [{ ...column, people: [], gaps: [] }]
      if (id !== entityId) return []
    }
    const next: OrgMapColumn = {
      ...column,
      people: column.people.filter(keepsPerson),
      gaps: column.gaps.filter(keepsGap),
    }
    // La colonne « rattachement inconnu » n'a pas de nœud d'entité : vidée, elle
    // n'est plus qu'une colonne fantôme.
    if (!next.entity && next.people.length === 0 && next.gaps.length === 0) return []
    return [next]
  })

  const visible = new Set<string>()
  for (const column of columns) {
    if (column.entity) visible.add(column.entity.id)
    for (const person of column.people) visible.add(person.id)
    for (const gap of column.gaps) visible.add(gap.id)
  }
  const roots = map.roots.filter(root => visible.has(root.id))

  return {
    ...map,
    roots,
    columns,
    links: map.links.filter(link => visible.has(link.fromId) && visible.has(link.toId)),
  }
}
