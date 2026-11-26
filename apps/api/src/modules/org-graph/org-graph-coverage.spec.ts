import { deriveOrgCoverage, orgGraphSchema, type OrgGraph } from '@bellum/contracts'
import { applyDeclaredPeople } from './org-graph-declare'
import { recomputeRecommendedPath } from './org-graph-path'
import { applyRelationVerdict } from './org-graph-verify'
import { applyOrgGraphCorrection, readStoredOrgGraph } from './org-graph-versioning'

/**
 * Le bandeau de couverture doit survivre à tout ce qui RÉÉCRIT le graphe stocké
 * sans relancer d'analyse.
 *
 * Le piège est silencieux et il est propre à zod : un objet retire les clés
 * qu'il ne connaît pas. Tant que `coverage` n'était pas au contrat, chacune des
 * quatre réécritures ci-dessous (`{ ...graph }` puis `safeParse`) l'aurait
 * effacé — un « ce contact est parti » aurait fait disparaître « 2 241
 * découverts » du dossier, et personne n'aurait su relier les deux.
 *
 * Ce qui répond à l'autre question, celle de la RÉ-ANALYSE : `raw_analysis` est
 * REMPLACÉ à chaque run, et c'est sans conséquence ici parce que la couverture
 * est DÉRIVÉE du corpus à chaque assemblage. Elle n'a rien d'humain à perdre —
 * contrairement à l'ardoise des rejets et aux personnes déclarées, qui vivent
 * pour cette raison dans des colonnes de `accounts` et sont regreffées.
 */

const COVERAGE = {
  discovered: 2241,
  deterministicClassified: 2103,
  llmEnriched: 50,
  enrichmentBatchSize: 50,
} as const

const graph = (): OrgGraph =>
  orgGraphSchema.parse({
    graphVersion: 4,
    entities: [{ id: 'e-g', name: 'Airbus SE', type: 'groupe', parentId: null, confidence: 90 }],
    people: [
      {
        id: 'p-alice',
        fullName: 'Alice A',
        title: 'Directrice Générale',
        entityId: 'e-g',
        hierarchyLevel: 'L1',
        decisionRoles: ['economic_buyer'],
        identityStatus: 'actionable',
        confidence: 88,
      },
      {
        id: 'p-bob',
        fullName: 'Bob B',
        title: 'Directeur Technique',
        entityId: 'e-g',
        hierarchyLevel: 'L2',
        decisionRoles: ['technical_buyer'],
        identityStatus: 'actionable',
        confidence: 75,
      },
    ],
    hierarchyEdges: [
      { fromId: 'p-bob', toId: 'p-alice', type: 'reports_to', sourceIds: [], confidence: 70, verified: false },
    ],
    recommendedPath: [{ step: 1, personId: 'p-bob', objective: 'cadrer' }],
    coverage: COVERAGE,
  })

describe('la couverture survit aux réécritures du graphe stocké', () => {
  it('se relit depuis raw_analysis', () => {
    const stored = readStoredOrgGraph({ org: { orgGraph: graph() } })
    expect(stored?.coverage?.discovered).toBe(2241)
  })

  it('survit à une correction — « ce contact est parti » n’efface pas le compte', () => {
    const next = applyOrgGraphCorrection(graph(), {
      version: 5,
      rejections: [{ sourceId: 'p-bob', reason: 'signalé parti' }],
    })
    expect(next).not.toBeNull()
    expect(next!.coverage?.discovered).toBe(2241)
    // Le nœud est bien parti : c'est la preuve que la réécriture a eu lieu et
    // que le test ne passe pas parce qu'il ne s'est rien passé.
    expect(next!.people.map(p => p.id)).toEqual(['p-alice'])
  })

  it('survit à un recalcul du chemin', () => {
    const next = recomputeRecommendedPath(graph(), { version: 5, relationshipState: null })
    expect(next?.coverage?.discovered).toBe(2241)
  })

  it('survit à une personne déclarée à la main', () => {
    const next = applyDeclaredPeople(graph(), [
      { fullName: 'Chloé C', title: 'Directrice Achats', declaredAt: '2026-08-29T10:00:00Z' },
    ])
    expect(next).not.toBeNull()
    expect(next!.coverage?.discovered).toBe(2241)
    expect(next!.people.length).toBe(3)
  })

  it('survit à la vérification d’une relation', () => {
    const next = applyRelationVerdict(graph(), {
      fromId: 'p-bob',
      toId: 'p-alice',
      type: 'reports_to',
      version: 5,
      at: '2026-08-31T09:00:00.000Z',
      verdict: {
        verified: true,
        confidence: 92,
        sources: [
          {
            id: 's-verif-1',
            kind: 'official_site',
            grounding: 'A',
            ref: 'https://airbus.example/gouvernance',
          },
        ],
      },
    })
    expect(next).not.toBeNull()
    expect(next!.coverage?.discovered).toBe(2241)
  })
})

describe('le bandeau reste juste après une correction', () => {
  it('recompte les liens plutôt que de recopier un compteur figé', () => {
    // Le lien probable disparaît avec le nœud élagué. Un compteur de liens
    // STOCKÉ aurait continué d'annoncer « 1 lien probable » pour toujours ;
    // dérivé, il tombe à zéro parce qu'il n'y en a réellement plus.
    expect(deriveOrgCoverage(graph()).hierarchyProbable).toBe(1)
    const next = applyOrgGraphCorrection(graph(), {
      version: 5,
      rejections: [{ sourceId: 'p-bob', reason: 'signalé parti' }],
    })
    expect(deriveOrgCoverage(next!).hierarchyProbable).toBe(0)
    // …et ce qui parle du CORPUS ne bouge pas : écarter quelqu'un du graphe ne
    // le retire pas du compte, il ne le rend pas non plus non découvert.
    expect(deriveOrgCoverage(next!).discovered).toBe(2241)
  })
})
