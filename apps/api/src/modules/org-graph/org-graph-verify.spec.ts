import { orgGraphSchema, type OrgGraph } from '@bellum/contracts'
import { applyRelationVerdict } from './org-graph-verify'

/**
 * « Vérifier une relation » (annexe p22) côté application du verdict.
 *
 * La recherche est faite par le service IA ; ce qui est testé ici, c'est ce que
 * l'API en fait sur le graphe STOCKÉ. Deux règles :
 *   · une preuve officielle fait passer le lien à vérifié (plein, sourcé, ≥ 90) ;
 *   · aucune preuve ⇒ le graphe est rendu inchangé (`null`) — l'absence de preuve
 *     n'est pas une preuve du contraire, on ne dégrade pas un lien.
 */

function graphWithInferredEdge(): OrgGraph {
  return orgGraphSchema.parse({
    graphVersion: 2,
    entities: [{ id: 'e1', name: 'TF1 Groupe', type: 'groupe', confidence: 85 }],
    people: [
      {
        id: 'p-marc',
        fullName: 'Marc Oliveira',
        title: 'DSI',
        entityId: 'e1',
        identityStatus: 'classified',
        confidence: 70,
      },
      {
        id: 'p-claire',
        fullName: 'Claire Basset',
        title: 'Directrice Data',
        entityId: 'e1',
        identityStatus: 'classified',
        confidence: 80,
      },
    ],
    hierarchyEdges: [
      { fromId: 'p-marc', toId: 'p-claire', type: 'reports_to', sourceIds: [], confidence: 55, verified: false },
    ],
    influenceEdges: [],
    buyingCommittee: [],
    uncoveredZones: [],
    recommendedPath: [],
    rejectedItems: [],
  })
}

const OFFICIAL = {
  verified: true,
  confidence: 92,
  sources: [
    {
      id: 's-verify-0',
      kind: 'official_site' as const,
      ref: 'https://tf1.fr/gouvernance',
      grounding: 'A' as const,
      date: '2026-07-23',
    },
  ],
}

describe('applyRelationVerdict', () => {
  it('rend le lien vérifié, sourcé, et porte la preuve sur le nœud', () => {
    const next = applyRelationVerdict(graphWithInferredEdge(), {
      fromId: 'p-marc',
      toId: 'p-claire',
      type: 'reports_to',
      version: 3,
      at: '2026-08-31T09:00:00.000Z',
      verdict: OFFICIAL,
    })

    expect(next).not.toBeNull()
    const edge = next!.hierarchyEdges[0]!
    expect(edge.verified).toBe(true)
    expect(edge.confidence).toBe(92)
    expect(edge.sourceIds).toContain('s-verify-0')
    // La preuve doit vivre sur un NŒUD : c'est là que le contrat (et le front)
    // vont la résoudre depuis les `sourceIds` de l'edge.
    expect(next!.people.find(p => p.id === 'p-marc')!.sources.map(s => s.id)).toContain('s-verify-0')
    expect(next!.graphVersion).toBe(3)
  })

  it('une preuve secondaire étaye sans jamais faire passer le lien pour vérifié', () => {
    const next = applyRelationVerdict(graphWithInferredEdge(), {
      fromId: 'p-marc',
      toId: 'p-claire',
      type: 'reports_to',
      version: 3,
      at: '2026-08-31T09:00:00.000Z',
      verdict: {
        verified: false,
        confidence: 78,
        sources: [
          {
            id: 's-verify-0',
            kind: 'linkedin',
            ref: 'https://linkedin.com/in/marc',
            grounding: 'B',
            date: '2026-07-23',
          },
        ],
      },
    })

    const edge = next!.hierarchyEdges[0]!
    expect(edge.verified).toBe(false)
    expect(edge.confidence).toBe(78)
    expect(edge.sourceIds).toContain('s-verify-0')
  })

  it('aucune preuve : le graphe est rendu inchangé, pas dégradé', () => {
    const next = applyRelationVerdict(graphWithInferredEdge(), {
      fromId: 'p-marc',
      toId: 'p-claire',
      type: 'reports_to',
      version: 3,
      at: '2026-08-31T09:00:00.000Z',
      verdict: { verified: false, confidence: null, sources: [] },
    })
    expect(next).toBeNull()
  })

  it('un lien inconnu du graphe ne crée rien — on ne fabrique pas la relation qu’on vérifie', () => {
    const next = applyRelationVerdict(graphWithInferredEdge(), {
      fromId: 'p-marc',
      toId: 'p-inconnu',
      type: 'reports_to',
      version: 3,
      at: '2026-08-31T09:00:00.000Z',
      verdict: OFFICIAL,
    })
    expect(next).toBeNull()
  })

  it('ne touche pas à un lien DÉJÀ vérifié — il est sourcé, il n’y a rien à revérifier', () => {
    const graph = orgGraphSchema.parse({
      ...graphWithInferredEdge(),
      people: [
        {
          id: 'p-marc',
          fullName: 'Marc Oliveira',
          entityId: 'e1',
          identityStatus: 'classified',
          confidence: 70,
          sources: [{ id: 's-old', kind: 'official_site', grounding: 'A', date: '2026-01-01' }],
        },
        { id: 'p-claire', fullName: 'Claire Basset', entityId: 'e1', identityStatus: 'classified', confidence: 80 },
      ],
      hierarchyEdges: [
        {
          fromId: 'p-marc',
          toId: 'p-claire',
          type: 'reports_to',
          sourceIds: ['s-old'],
          confidence: 95,
          verified: true,
        },
      ],
    })
    const next = applyRelationVerdict(graph, {
      fromId: 'p-marc',
      toId: 'p-claire',
      type: 'reports_to',
      version: 3,
      at: '2026-08-31T09:00:00.000Z',
      verdict: OFFICIAL,
    })
    expect(next).toBeNull()
  })

  it('le graphe rendu reste valide au contrat (un vérifié sans source serait refusé)', () => {
    const next = applyRelationVerdict(graphWithInferredEdge(), {
      fromId: 'p-marc',
      toId: 'p-claire',
      type: 'reports_to',
      version: 3,
      at: '2026-08-31T09:00:00.000Z',
      verdict: { ...OFFICIAL, sources: [] },
    })
    // verified sans preuve = invariant violé : on refuse d'écrire.
    expect(next).toBeNull()
  })
})

/* ------------------------------------------------------------------ */
/*  La FRAÎCHEUR — une vérification a une DATE, sinon elle ne vieillit */
/*  jamais (31/08/2026)                                                */
/* ------------------------------------------------------------------ */

describe('applyRelationVerdict — la vérification est datée', () => {
  it('un lien vérifié porte la date du geste, pas celle de l’écriture', () => {
    const next = applyRelationVerdict(graphWithInferredEdge(), {
      fromId: 'p-marc',
      toId: 'p-claire',
      type: 'reports_to',
      version: 3,
      at: '2026-08-31T09:00:00.000Z',
      verdict: {
        verified: true,
        confidence: 94,
        sources: [
          {
            id: 's-verify-0',
            kind: 'official_site',
            ref: 'https://acme.example/gouvernance',
            grounding: 'A',
            date: '2026-08-20',
            claim: 'relation',
          },
        ],
      },
    })
    expect(next!.hierarchyEdges[0]!.lastVerifiedAt).toBe('2026-08-31T09:00:00.000Z')
  })

  it('une vérification NÉGATIVE ne pose aucune date — elle n’a rien établi', () => {
    const next = applyRelationVerdict(graphWithInferredEdge(), {
      fromId: 'p-marc',
      toId: 'p-claire',
      type: 'reports_to',
      version: 3,
      at: '2026-08-31T09:00:00.000Z',
      verdict: {
        verified: false,
        confidence: 60,
        sources: [
          {
            id: 's-verify-0',
            kind: 'linkedin',
            ref: 'https://linkedin.example/in/marc',
            grounding: 'B',
            date: '2026-08-20',
            claim: 'relation',
          },
        ],
      },
    })
    expect(next!.hierarchyEdges[0]!.lastVerifiedAt).toBeUndefined()
  })
})
