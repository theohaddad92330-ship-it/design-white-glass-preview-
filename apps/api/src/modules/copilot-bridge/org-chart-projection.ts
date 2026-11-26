import { orgGraphSchema, partitionOrgHierarchy, type OrgGraph } from '@bellum/contracts'

/**
 * LOT (15/10) DATA-B.4 — la LECTURE de l'onglet Organigramme, pour Laura.
 *
 * L'onglet lit `raw_analysis.org.orgGraph` (contrat `orgGraphSchema`), en retire les personnes écartées
 * (`filterOrgGraphByExcludedContacts`, web) et partitionne les liens avec `partitionOrgHierarchy` : ce
 * module fait la MÊME chose, puis PROJETTE une version bornée (une bulle de conversation se lit, elle ne se
 * dépouille pas — la carte complète reste sur l'écran). Aucun second calcul : ce qui est vérifié l'est selon
 * `verified === true`, jamais selon la confiance ; une absence ne fait aucune ligne.
 *
 * Pur — aucune lecture : l'appelant fournit le `raw_analysis.org` du compte et les noms des contacts écartés.
 */
const MAX_PEOPLE = 25
const MAX_ENTITIES = 15
const MAX_LINES = 15
const MAX_COMMITTEE = 12
const MAX_PATH_STEPS = 6

/** Jetons du nom, sans diacritiques ni casse, triés — ignore l'ordre prénom/nom (même clé que l'écran). */
export function looseNameKey(fullName: string | null | undefined): string | null {
  const tokens = (fullName ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .sort()
  return tokens.length > 0 ? tokens.join(' ') : null
}

export type OrgChartProjection =
  | { status: 'no_graph' }
  | {
      status: 'ok'
      graph_version: number
      graph_confidence: number | null
      counts: { entities: number; people: number; verified_lines: number; inferred_lines: number }
      entities: { name: string; type: string; parent?: string }[]
      people: {
        full_name: string
        title?: string
        entity?: string
        hierarchy_level?: string
        decision_roles: string[]
        identity_status: string
        confidence: number
        role_inferred?: boolean
      }[]
      people_not_shown: number
      verified_lines: { from: string; to: string; type: string; confidence: number }[]
      buying_committee: { person: string; role: string; entity?: string; access_score?: number; reason?: string }[]
      recommended_path: { step: number; person: string; objective: string; channel?: string }[]
    }

function withoutExcluded(graph: OrgGraph, excludedKeys: ReadonlySet<string>): OrgGraph {
  if (excludedKeys.size === 0) return graph
  const dropped = new Set(
    graph.people.filter(p => excludedKeys.has(looseNameKey(p.fullName) ?? '\u0000')).map(p => p.id),
  )
  if (dropped.size === 0) return graph
  const kept = (id: string): boolean => !dropped.has(id)
  return {
    ...graph,
    people: graph.people.filter(p => kept(p.id)),
    hierarchyEdges: graph.hierarchyEdges.filter(e => kept(e.fromId) && kept(e.toId)),
    influenceEdges: graph.influenceEdges.filter(e => kept(e.fromId) && kept(e.toId)),
    relationalEdges: graph.relationalEdges.filter(e => kept(e.fromId) && kept(e.toId)),
    buyingCommittee: graph.buyingCommittee.filter(m => kept(m.personId)),
    recommendedPath: graph.recommendedPath.filter(s => kept(s.personId)),
  }
}

export function projectOrgChart(rawOrg: unknown, excludedNames: readonly string[]): OrgChartProjection {
  const org = rawOrg && typeof rawOrg === 'object' ? (rawOrg as Record<string, unknown>) : null
  const parsed = org ? orgGraphSchema.safeParse(org['orgGraph']) : null
  if (!parsed?.success) return { status: 'no_graph' }
  const excludedKeys = new Set(excludedNames.map(n => looseNameKey(n)).filter((k): k is string => Boolean(k)))
  const graph = withoutExcluded(parsed.data, excludedKeys)

  const personName = new Map(graph.people.map(p => [p.id, p.fullName]))
  const entityName = new Map(graph.entities.map(e => [e.id, e.name]))
  const { verified, inferred } = partitionOrgHierarchy(graph.hierarchyEdges)
  const pool = graph.people.length > 0 ? graph.people : graph.entities
  const graphConfidence =
    pool.length > 0 ? Math.round(pool.reduce((acc, node) => acc + node.confidence, 0) / pool.length) : null

  const people = graph.people.slice(0, MAX_PEOPLE).map(p => ({
    full_name: p.fullName,
    ...(p.title ? { title: p.title } : {}),
    ...(p.entityId && entityName.get(p.entityId) ? { entity: entityName.get(p.entityId) as string } : {}),
    ...(p.hierarchyLevel ? { hierarchy_level: p.hierarchyLevel } : {}),
    decision_roles: [...p.decisionRoles],
    identity_status: p.identityStatus,
    confidence: p.confidence,
    ...(p.roleInferred ? { role_inferred: true } : {}),
  }))

  return {
    status: 'ok',
    graph_version: graph.graphVersion,
    graph_confidence: graphConfidence,
    counts: {
      entities: graph.entities.length,
      people: graph.people.length,
      verified_lines: verified.length,
      inferred_lines: inferred.length,
    },
    entities: graph.entities.slice(0, MAX_ENTITIES).map(e => ({
      name: e.name,
      type: e.type,
      ...(e.parentId && entityName.get(e.parentId) ? { parent: entityName.get(e.parentId) as string } : {}),
    })),
    people,
    people_not_shown: graph.people.length - people.length,
    verified_lines: verified.slice(0, MAX_LINES).flatMap(e => {
      const from = personName.get(e.fromId) ?? entityName.get(e.fromId)
      const to = personName.get(e.toId) ?? entityName.get(e.toId)
      return from && to ? [{ from, to, type: e.type, confidence: e.confidence }] : []
    }),
    buying_committee: graph.buyingCommittee.slice(0, MAX_COMMITTEE).flatMap(m => {
      const person = personName.get(m.personId)
      if (!person) return []
      return [
        {
          person,
          role: m.role,
          ...(m.entityId && entityName.get(m.entityId) ? { entity: entityName.get(m.entityId) as string } : {}),
          ...(typeof m.accessScore === 'number' ? { access_score: m.accessScore } : {}),
          ...(m.reason ? { reason: m.reason } : {}),
        },
      ]
    }),
    recommended_path: graph.recommendedPath.slice(0, MAX_PATH_STEPS).flatMap(s => {
      const person = personName.get(s.personId)
      if (!person) return []
      return [{ step: s.step, person, objective: s.objective, ...(s.channel ? { channel: s.channel } : {}) }]
    }),
  }
}
