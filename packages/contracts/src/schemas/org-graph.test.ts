import { describe, expect, it } from 'vitest'
import {
  orgDecisionRoleSchema,
  orgEntitySchema,
  orgEntityTypeSchema,
  orgGraphSchema,
  orgHierarchyEdgeSchema,
  orgHierarchyLevelSchema,
  orgIdentityStatusSchema,
  orgInfluenceEdgeSchema,
  orgItAutonomySchema,
  orgRelationalEdgeScopeSchema,
  orgRelationalEdgeTypeSchema,
  type OrgGraph,
} from './org-graph.js'

/** A minimal, fully-valid OrgGraph: a group with one BU, a DG reporting nowhere
 *  and a director reporting to them (verified), one influence edge, a committee
 *  seat, an uncovered zone, a one-step path, and a rejected homonym. */
const validGraph = (): OrgGraph =>
  orgGraphSchema.parse({
    graphVersion: 1,
    promptHash: 'abc123',
    entities: [
      { id: 'e-group', name: 'TF1 Groupe', type: 'groupe', parentId: null, confidence: 95 },
      { id: 'e-pub', name: 'TF1 Pub', type: 'filiale', parentId: 'e-group', status: 'operating', confidence: 88 },
    ],
    people: [
      {
        id: 'p-dg',
        fullName: 'Alice DG',
        title: 'Directrice Générale',
        entityId: 'e-group',
        hierarchyLevel: 'L1',
        decisionRoles: ['economic_buyer'],
        identityStatus: 'actionable',
        confidence: 90,
      },
      {
        id: 'p-dir',
        fullName: 'Bob Dir',
        title: 'Directeur Adtech',
        entityId: 'e-pub',
        hierarchyLevel: 'L2',
        decisionRoles: ['technical_buyer'],
        identityStatus: 'classified',
        confidence: 70,
      },
    ],
    hierarchyEdges: [
      { fromId: 'p-dir', toId: 'p-dg', type: 'reports_to', sourceIds: ['s1'], confidence: 92, verified: true },
      { fromId: 'p-dir', toId: 'e-pub', type: 'member_of', sourceIds: [], confidence: 75, verified: false },
    ],
    influenceEdges: [
      {
        fromId: 'p-dir',
        toId: 'p-dg',
        topic: 'adtech stack',
        stance: 'supporter',
        confidence: 60,
        reasoning: 'co-cité sur le programme Graph:ID',
      },
    ],
    buyingCommittee: [{ personId: 'p-dg', role: 'economic_buyer', entityId: 'e-group', accessScore: 40 }],
    uncoveredZones: [
      {
        entityId: 'e-pub',
        family: 'Data / Adtech',
        hierarchyLevel: 'L1',
        importance: 'critique',
        reason: '9 contacts ne couvrent que la gouvernance',
        suggestedTitles: ['Head of Data'],
        suggestedQueries: ['TF1 Pub Head of Data'],
        estimatedAvailable: 30,
      },
    ],
    recommendedPath: [{ step: 1, personId: 'p-dir', objective: 'qualifier le besoin Adtech', channel: 'linkedin' }],
    rejectedItems: [{ sourceId: 'x-homonym', reason: 'homonyme — mauvaise entité' }],
  })

describe('OrgGraph — enums (Théo ontology)', () => {
  it('carries the structural entity types (p6)', () => {
    expect(orgEntityTypeSchema.options).toEqual([
      'groupe',
      'filiale',
      'bu',
      'departement',
      'programme',
      'site',
      'spv',
      'factory',
      'data_office',
      'lab',
      // #2310.2/#2310.8 (épopée #2919) — ajoutés en FIN (GA-08).
      'equipe',
      'partenaire',
    ])
  })

  /**
   * #2636.1 — l'organigramme ne cherchait l'IA qu'« en central » : les unités
   * IA/Data nommées comme telles (« AI Factory », « Data Office », « Lab »)
   * retombaient sur le générique `bu`, et le modèle d'organisation IA collecté
   * par Phase 1 (`it_autonomy` — autonome/partagé/centralisé) n'atteignait
   * jamais le graphe affiché à l'écran.
   */
  it('#2636.1 — porte le modèle d’organisation IA par entité (autonome/partagé/centralisé)', () => {
    expect(orgItAutonomySchema.options).toEqual(['autonome', 'partage', 'centralise'])
    const entity = orgEntitySchema.parse({
      id: 'e-data',
      name: 'Decathlon Data Office',
      type: 'data_office',
      parentId: 'e-group',
      confidence: 80,
      itAutonomy: 'partage',
    })
    expect(entity.itAutonomy).toBe('partage')
  })
  it('carries the 6 hierarchy levels L0..L5 (p7)', () => {
    expect(orgHierarchyLevelSchema.options).toEqual(['L0', 'L1', 'L2', 'L3', 'L4', 'L5'])
  })
  it('carries the 8 buying roles incl. unknown (p8)', () => {
    expect(orgDecisionRoleSchema.options).toContain('unknown')
    expect(orgDecisionRoleSchema.options).toHaveLength(8)
  })
  it('carries the 7-state contact lifecycle incl. historical + rejected (p15)', () => {
    expect(orgIdentityStatusSchema.options).toEqual([
      'seed',
      'verified_identity',
      'classified',
      'enriched',
      'actionable',
      'historical',
      'rejected',
    ])
  })
})

describe('OrgGraph — a well-formed graph parses', () => {
  it('accepts the canonical fixture', () => {
    expect(() => validGraph()).not.toThrow()
  })
  it('applies array defaults', () => {
    const g = orgGraphSchema.parse({ graphVersion: 1 })
    expect(g.entities).toEqual([])
    expect(g.people).toEqual([])
    expect(g.hierarchyEdges).toEqual([])
  })
})

describe('OrgGraph — grounding thresholds on hierarchy edges (p10/p14)', () => {
  const base = { fromId: 'a', toId: 'b', type: 'reports_to' as const }
  it('rejects a verified edge with no sourceId (no line without proof)', () => {
    expect(() => orgHierarchyEdgeSchema.parse({ ...base, sourceIds: [], confidence: 95, verified: true })).toThrow()
  })
  it('rejects a verified edge with confidence < 90', () => {
    expect(() => orgHierarchyEdgeSchema.parse({ ...base, sourceIds: ['s1'], confidence: 80, verified: true })).toThrow()
  })
  it('rejects an unverified edge with confidence > 89 (that would be verified)', () => {
    expect(() => orgHierarchyEdgeSchema.parse({ ...base, sourceIds: [], confidence: 95, verified: false })).toThrow()
  })
  it('accepts a sourced verified edge ≥ 90 and an inferred edge ≤ 89', () => {
    expect(() =>
      orgHierarchyEdgeSchema.parse({ ...base, sourceIds: ['s1'], confidence: 92, verified: true }),
    ).not.toThrow()
    expect(() =>
      orgHierarchyEdgeSchema.parse({ ...base, sourceIds: [], confidence: 70, verified: false }),
    ).not.toThrow()
  })
})

describe('OrgGraph — influence edges must reason (p27)', () => {
  it('rejects an influence edge with empty reasoning', () => {
    expect(() =>
      orgInfluenceEdgeSchema.parse({ fromId: 'a', toId: 'b', topic: 't', confidence: 50, reasoning: '' }),
    ).toThrow()
  })
})

describe('OrgGraph — referential integrity (p27/p30)', () => {
  it('rejects an entity parentId that does not resolve', () => {
    const g = validGraph()
    g.entities[1].parentId = 'e-ghost'
    expect(() => orgGraphSchema.parse(g)).toThrow()
  })
  it('rejects a person attached to an unknown entity', () => {
    const g = validGraph()
    g.people[0].entityId = 'e-ghost'
    expect(() => orgGraphSchema.parse(g)).toThrow()
  })
  it('rejects a hierarchy edge referencing an unknown node', () => {
    const g = validGraph()
    g.hierarchyEdges[0].fromId = 'p-ghost'
    expect(() => orgGraphSchema.parse(g)).toThrow()
  })
  it('rejects a committee seat for an unknown person', () => {
    const g = validGraph()
    g.buyingCommittee[0].personId = 'p-ghost'
    expect(() => orgGraphSchema.parse(g)).toThrow()
  })
  it('rejects a recommended step for an unknown person', () => {
    const g = validGraph()
    g.recommendedPath[0].personId = 'p-ghost'
    expect(() => orgGraphSchema.parse(g)).toThrow()
  })
  it('rejects a rejected person appearing in the recommended path (p30)', () => {
    const g = validGraph()
    g.recommendedPath[0].personId = 'p-dir'
    g.rejectedItems.push({ sourceId: 'p-dir', reason: 'parti' })
    expect(() => orgGraphSchema.parse(g)).toThrow()
  })
  it('rejects a rejected id that still appears as an active node (p27)', () => {
    const g = validGraph()
    g.rejectedItems.push({ sourceId: 'p-dg', reason: 'devrait avoir disparu' })
    expect(() => orgGraphSchema.parse(g)).toThrow()
  })
  it('rejects an entity that is its own parent', () => {
    const g = validGraph()
    g.entities[0].parentId = 'e-group'
    expect(() => orgGraphSchema.parse(g)).toThrow()
  })
})

describe('OrgGraph — edges relationnels (#2919, issue #2310)', () => {
  it('porte les cinq natures demandées, works_with compris (distinct du works_with personne↔personne)', () => {
    expect(orgRelationalEdgeTypeSchema.options).toEqual([
      'works_with',
      'owns_project',
      'blocks',
      'introduced_by',
      'related_workspace',
    ])
  })

  it('#2310.27 — porte un scope (workspace ou market_memory), rien d’autre', () => {
    expect(orgRelationalEdgeScopeSchema.options).toEqual(['workspace', 'market_memory'])
  })

  it('#2310.28 — un edge relationnel sans auteur est refusé', () => {
    const g = validGraph()
    g.relationalEdges = [
      {
        fromId: 'p-dir',
        toId: 'e-pub',
        type: 'owns_project',
        scope: 'workspace',
        author: '',
        sourceIds: [],
        confidence: 60,
      },
    ]
    expect(() => orgGraphSchema.parse(g)).toThrow()
  })

  it('accepte un edge relationnel bien formé, entre une personne et une entité équipe/partenaire', () => {
    const g = validGraph()
    g.entities.push({
      id: 'e-squad',
      name: 'Squad Data',
      type: 'equipe',
      status: 'operating',
      sources: [],
      confidence: 70,
    })
    g.relationalEdges = [
      {
        fromId: 'p-dir',
        toId: 'e-squad',
        type: 'owns_project',
        scope: 'workspace',
        author: 'Louis (saisie manuelle)',
        sourceIds: [],
        confidence: 55,
      },
    ]
    const parsed = orgGraphSchema.parse(g)
    expect(parsed.relationalEdges).toHaveLength(1)
  })

  it('rejette un edge relationnel qui référence un nœud inconnu', () => {
    const g = validGraph()
    g.relationalEdges = [
      {
        fromId: 'p-ghost',
        toId: 'p-dg',
        type: 'blocks',
        scope: 'workspace',
        author: 'Louis',
        sourceIds: [],
        confidence: 50,
      },
    ]
    expect(() => orgGraphSchema.parse(g)).toThrow()
  })

  it('un graphe antérieur à ce chantier (sans relationalEdges) reste valide — [] par défaut', () => {
    const g = validGraph() as Record<string, unknown>
    delete g['relationalEdges']
    const parsed = orgGraphSchema.parse(g)
    expect(parsed.relationalEdges).toEqual([])
  })
})

describe('OrgGraph — une influence porte sa provenance (D405, GA-139)', () => {
  const base = {
    fromId: 'a',
    toId: 'b',
    topic: 'budget cloud',
    confidence: 40,
    reasoning: 'hypothèse issue du titre / cooccurrence (grounding C)',
  }

  it('sourceIds et derivedAt par défaut : rétrocompatible avec un graphe stocké avant ce chantier', () => {
    const edge = orgInfluenceEdgeSchema.parse(base)
    expect(edge.sourceIds).toEqual([])
    expect(edge.derivedAt).toBeUndefined()
  })

  it('porte ses sourceIds et la date de dérivation du run quand le producteur les renseigne', () => {
    const edge = orgInfluenceEdgeSchema.parse({
      ...base,
      sourceIds: ['s-llm-inf-0'],
      derivedAt: '2026-08-30T09:00:00.000Z',
    })
    expect(edge.sourceIds).toEqual(['s-llm-inf-0'])
    expect(edge.derivedAt).toBe('2026-08-30T09:00:00.000Z')
  })

  it('un graphe complet avec influenceEdges sourcées et datées reste valide', () => {
    const g = validGraph()
    g.influenceEdges[0].sourceIds = ['s1']
    g.influenceEdges[0].derivedAt = '2026-08-30T09:00:00.000Z'
    expect(() => orgGraphSchema.parse(g)).not.toThrow()
  })
})
