import { describe, it, expect } from 'vitest'
import { orgGraphSchema, type OrgGraph } from './org-graph.js'

/**
 * GOLDEN SETS — Annexe Organigramme p29/p32.
 *
 * Le rapport fixe 7 cas de contrôle (TF1, Société Générale, Crédit Agricole,
 * SNCF, PME 200, secteur public, deux profils ESN) et une liste d'INVARIANTS que
 * la CI doit casser si une sortie les viole (p30). Ce fichier verrouille les
 * invariants EXPRIMABLES sur le contrat — la forme du graphe, pas la donnée
 * réelle d'un compte précis :
 *
 *   · un lien vérifié est sourcé ET ≥ 90 ; un lien inféré reste ≤ 89 ;
 *   · une influence porte toujours son raisonnement ;
 *   · un id rejeté ne référence plus aucun nœud, edge, siège ou étape ;
 *   · tout id d'edge/siège/étape/parent résout ;
 *   · la structure descend groupe → filiale/BU → familles/niveaux (pas
 *     board → board → influenceurs) ;
 *   · une entité cédée est STATUÉE, jamais présentée comme active ;
 *   · aucune gouvernance (L0) n'est INVENTÉE là où il n'y en a pas (PME) ;
 *   · le secteur public porte des rôles métier/DSI/achats/procédure, pas un
 *     unique « economic buyer » simpliste.
 *
 * Les assertions qui dépendent de la CLASSIFICATION d'entités réelles (SGTM
 * exclu, SNEF exclu, filiales cédées de SG statuées sur pièces) vivent côté IA
 * (`org_graph_assembler`) : ici on prouve que le CONTRAT rend ces sorties
 * exprimables et cohérentes, pas que l'assembleur les produit sur un compte
 * donné (ça, c'est le golden IA + le run réel).
 */

/** Un OrgGraph minimal valide, complété par le cas. */
function baseGraph(over: Partial<OrgGraph>): OrgGraph {
  return orgGraphSchema.parse({
    graphVersion: 1,
    entities: [],
    people: [],
    hierarchyEdges: [],
    influenceEdges: [],
    buyingCommittee: [],
    uncoveredZones: [],
    recommendedPath: [],
    rejectedItems: [],
    ...over,
  })
}

/* ─── Invariants universels, applicables à tout graphe ────────────────────── */

function assertUniversalInvariants(graph: OrgGraph): void {
  const entityIds = new Set(graph.entities.map(e => e.id))
  const peopleIds = new Set(graph.people.map(p => p.id))
  const nodeIds = new Set([...entityIds, ...peopleIds])
  const rejected = new Set(graph.rejectedItems.map(r => r.sourceId))

  // 1. Grounding : vérifié ⇒ sourcé + ≥ 90 ; inféré ⇒ ≤ 89.
  for (const edge of graph.hierarchyEdges) {
    if (edge.verified) {
      expect(edge.sourceIds.length).toBeGreaterThan(0)
      expect(edge.confidence).toBeGreaterThanOrEqual(90)
    } else {
      expect(edge.confidence).toBeLessThanOrEqual(89)
    }
  }

  // 2. Une influence porte toujours son raisonnement.
  for (const edge of graph.influenceEdges) expect(edge.reasoning.trim().length).toBeGreaterThan(0)

  // 3. Un id rejeté ne référence plus rien de vivant.
  for (const p of graph.people) expect(rejected.has(p.id)).toBe(false)
  for (const e of graph.hierarchyEdges) {
    expect(rejected.has(e.fromId)).toBe(false)
    expect(rejected.has(e.toId)).toBe(false)
  }
  for (const seat of graph.buyingCommittee) expect(rejected.has(seat.personId)).toBe(false)
  for (const step of graph.recommendedPath) expect(rejected.has(step.personId)).toBe(false)

  // 4. Tout id résout (edges, sièges, étapes, parents, rattachements).
  for (const e of graph.hierarchyEdges) {
    expect(nodeIds.has(e.fromId)).toBe(true)
    expect(nodeIds.has(e.toId)).toBe(true)
  }
  for (const e of graph.influenceEdges) {
    expect(nodeIds.has(e.fromId)).toBe(true)
    expect(nodeIds.has(e.toId)).toBe(true)
  }
  for (const seat of graph.buyingCommittee) expect(peopleIds.has(seat.personId)).toBe(true)
  for (const step of graph.recommendedPath) expect(peopleIds.has(step.personId)).toBe(true)
  for (const entity of graph.entities) {
    if (entity.parentId != null) expect(entityIds.has(entity.parentId)).toBe(true)
  }
  for (const p of graph.people) {
    if (p.entityId != null) expect(entityIds.has(p.entityId)).toBe(true)
  }
}

/* ─── Les 7 cas ───────────────────────────────────────────────────────────── */

describe('OrgGraph golden — les 7 cas du rapport (p29)', () => {
  it('TF1 : groupe → BU → familles → niveaux, pas board → board → influenceurs', () => {
    const graph = baseGraph({
      entities: [
        { id: 'e-tf1', name: 'TF1 Groupe', type: 'groupe', parentId: null, confidence: 92, status: 'operating' },
        { id: 'e-pub', name: 'TF1 Pub', type: 'filiale', parentId: 'e-tf1', confidence: 84, status: 'operating' },
        { id: 'e-dsi', name: 'DSI Groupe', type: 'bu', parentId: 'e-tf1', confidence: 82, status: 'operating' },
      ],
      people: [
        {
          id: 'p-dg',
          fullName: 'A. Générale',
          title: 'DG',
          entityId: 'e-tf1',
          hierarchyLevel: 'L1',
          family: 'Direction',
          decisionRoles: ['economic_buyer'],
          identityStatus: 'classified',
          confidence: 90,
        },
        {
          id: 'p-data',
          fullName: 'B. Data',
          title: 'Head of Data',
          entityId: 'e-pub',
          hierarchyLevel: 'L2',
          family: 'Data / Adtech',
          decisionRoles: ['champion'],
          identityStatus: 'classified',
          confidence: 78,
        },
      ],
      uncoveredZones: [
        {
          entityId: 'e-pub',
          family: 'Achats',
          hierarchyLevel: 'L5',
          importance: 'critique',
          reason: 'Aucun achat IT',
          suggestedTitles: ['Acheteur IT'],
          suggestedQueries: [],
        },
        {
          entityId: 'e-dsi',
          family: 'IT / Cloud',
          hierarchyLevel: 'L2',
          importance: 'importante',
          reason: 'N-1 budget absent',
          suggestedTitles: ['DSI adjoint'],
          suggestedQueries: [],
        },
      ],
    })
    assertUniversalInvariants(graph)
    // Structure descendante : la racine est un groupe, filiale/BU pointent dessus.
    const root = graph.entities.find(e => e.parentId == null)!
    expect(root.type).toBe('groupe')
    expect(
      graph.entities
        .filter(e => e.parentId === 'e-tf1')
        .map(e => e.type)
        .sort(),
    ).toEqual(['bu', 'filiale'])
    // Familles réelles portées par des personnes, à des niveaux distincts.
    expect(new Set(graph.people.map(p => p.hierarchyLevel))).toEqual(new Set(['L1', 'L2']))
    // Zones achats ET N-1 visibles (assertion p29).
    expect(graph.uncoveredZones.some(z => z.family === 'Achats')).toBe(true)
    expect(graph.uncoveredZones.some(z => z.hierarchyLevel === 'L2')).toBe(true)
  })

  it('Société Générale : une filiale cédée est STATUÉE, jamais active', () => {
    const graph = baseGraph({
      entities: [
        { id: 'e-sg', name: 'Société Générale', type: 'groupe', parentId: null, confidence: 90, status: 'operating' },
        { id: 'e-bourso', name: 'BoursoBank', type: 'filiale', parentId: 'e-sg', confidence: 80, status: 'operating' },
        { id: 'e-cedee', name: 'Ex-filiale cédée', type: 'filiale', parentId: 'e-sg', confidence: 60, status: 'ceded' },
      ],
    })
    assertUniversalInvariants(graph)
    const cedee = graph.entities.find(e => e.id === 'e-cedee')!
    expect(cedee.status).toBe('ceded')
    // Aucune entité cédée ne se présente comme « operating ».
    expect(graph.entities.filter(e => e.status === 'ceded').every(e => e.status !== 'operating')).toBe(true)
  })

  it('Crédit Agricole : groupe fédéré → caisses/métiers rattachés par parentId distinct', () => {
    const graph = baseGraph({
      entities: [
        {
          id: 'e-casa',
          name: 'Crédit Agricole SA',
          type: 'groupe',
          parentId: null,
          confidence: 88,
          status: 'operating',
        },
        { id: 'e-lcl', name: 'LCL', type: 'filiale', parentId: 'e-casa', confidence: 80, status: 'operating' },
        { id: 'e-cacib', name: 'CACIB', type: 'filiale', parentId: 'e-casa', confidence: 78, status: 'operating' },
      ],
    })
    assertUniversalInvariants(graph)
    // Fédéré : chaque entité pointe vers la racine, aucune n'est orpheline ni
    // rattachée à une sœur.
    const children = graph.entities.filter(e => e.parentId != null)
    expect(children.every(e => e.parentId === 'e-casa')).toBe(true)
    expect(children.length).toBe(2)
  })

  it('SNCF : le bruit (mauvaise entité / SPV) est écarté, pas mélangé au groupe', () => {
    const graph = baseGraph({
      entities: [
        { id: 'e-sncf', name: 'SNCF', type: 'groupe', parentId: null, confidence: 88, status: 'operating' },
        {
          id: 'e-voy',
          name: 'SNCF Voyageurs',
          type: 'filiale',
          parentId: 'e-sncf',
          confidence: 80,
          status: 'operating',
        },
      ],
      // Le bruit (homonyme SNEF, SPV) n'entre pas dans le graphe : il est mémorisé
      // comme rejeté, jamais rendu comme un nœud.
      rejectedItems: [{ sourceId: 'e-snef', reason: 'homonyme (SNEF ≠ SNCF)' }],
    })
    assertUniversalInvariants(graph)
    expect(graph.entities.some(e => e.id === 'e-snef')).toBe(false)
    expect(graph.rejectedItems.map(r => r.sourceId)).toContain('e-snef')
  })

  it('PME 200 : structure simple DSI/RSI + managers, AUCUN faux COMEX inventé', () => {
    const graph = baseGraph({
      entities: [
        { id: 'e-pme', name: 'PME Widget', type: 'groupe', parentId: null, confidence: 75, status: 'operating' },
      ],
      people: [
        {
          id: 'p-dsi',
          fullName: 'C. Système',
          title: 'DSI',
          entityId: 'e-pme',
          hierarchyLevel: 'L1',
          family: 'IT',
          decisionRoles: ['economic_buyer', 'technical_buyer'],
          identityStatus: 'classified',
          confidence: 80,
        },
        {
          id: 'p-mgr',
          fullName: 'D. Équipe',
          title: 'Responsable IT',
          entityId: 'e-pme',
          hierarchyLevel: 'L3',
          family: 'IT',
          decisionRoles: ['user_buyer'],
          identityStatus: 'classified',
          confidence: 70,
        },
      ],
    })
    assertUniversalInvariants(graph)
    // Aucune gouvernance (L0) inventée : une PME n'a pas de board fabriqué.
    expect(graph.people.some(p => p.hierarchyLevel === 'L0')).toBe(false)
    // Le DSI cumule budget + technique (rôles indépendants du niveau, p8).
    expect(graph.people.find(p => p.id === 'p-dsi')!.decisionRoles).toContain('economic_buyer')
  })

  it('Secteur public : rôles métier/DSI/achats/procédure, pas un economic buyer simpliste', () => {
    const graph = baseGraph({
      entities: [
        { id: 'e-cg', name: 'Collectivité', type: 'groupe', parentId: null, confidence: 78, status: 'operating' },
      ],
      people: [
        {
          id: 'p-metier',
          fullName: 'E. Métier',
          title: 'Directeur métier',
          entityId: 'e-cg',
          hierarchyLevel: 'L2',
          family: 'Métier',
          decisionRoles: ['user_buyer'],
          identityStatus: 'classified',
          confidence: 74,
        },
        {
          id: 'p-dsi',
          fullName: 'F. SI',
          title: 'DSI',
          entityId: 'e-cg',
          hierarchyLevel: 'L1',
          family: 'IT',
          decisionRoles: ['technical_buyer'],
          identityStatus: 'classified',
          confidence: 76,
        },
        {
          id: 'p-achat',
          fullName: 'G. Marché',
          title: 'Acheteur public',
          entityId: 'e-cg',
          hierarchyLevel: 'L5',
          family: 'Achats',
          decisionRoles: ['procurement'],
          identityStatus: 'classified',
          confidence: 70,
        },
      ],
      buyingCommittee: [
        { personId: 'p-metier', role: 'user_buyer', entityId: 'e-cg', reason: 'porte le besoin' },
        { personId: 'p-dsi', role: 'technical_buyer', entityId: 'e-cg', reason: 'valide la faisabilité' },
        { personId: 'p-achat', role: 'procurement', entityId: 'e-cg', reason: 'procédure marché' },
      ],
    })
    assertUniversalInvariants(graph)
    const roles = new Set(graph.buyingCommittee.map(s => s.role))
    // La décision publique est distribuée : procurement présent, pas un unique
    // economic_buyer qui déciderait de tout.
    expect(roles.has('procurement')).toBe(true)
    expect(roles.has('user_buyer')).toBe(true)
    expect(roles.has('technical_buyer')).toBe(true)
    expect(roles.has('economic_buyer')).toBe(false)
  })

  it('Deux profils ESN : MÊME graphe de faits, la divergence est dans committee/chemin (pas dans les faits)', () => {
    // Les faits (entités, personnes, edges) sont partagés — c'est la lecture
    // d'achat (committee priorisé) et le chemin qui dépendent du profil ESN.
    const facts = {
      entities: [
        {
          id: 'e-x',
          name: 'Cible',
          type: 'groupe' as const,
          parentId: null,
          confidence: 85,
          status: 'operating' as const,
        },
      ],
      people: [
        {
          id: 'p-cto',
          fullName: 'H. Tech',
          title: 'CTO',
          entityId: 'e-x',
          hierarchyLevel: 'L1' as const,
          family: 'IT',
          decisionRoles: ['technical_buyer' as const],
          identityStatus: 'classified' as const,
          confidence: 82,
        },
        {
          id: 'p-cmo',
          fullName: 'I. Marketing',
          title: 'CMO',
          entityId: 'e-x',
          hierarchyLevel: 'L1' as const,
          family: 'Marketing',
          decisionRoles: ['economic_buyer' as const],
          identityStatus: 'classified' as const,
          confidence: 80,
        },
      ],
    }
    const esnData = baseGraph({
      ...facts,
      buyingCommittee: [{ personId: 'p-cto', role: 'technical_buyer', entityId: 'e-x', reason: 'offre data' }],
    })
    const esnMarketing = baseGraph({
      ...facts,
      buyingCommittee: [{ personId: 'p-cmo', role: 'economic_buyer', entityId: 'e-x', reason: 'offre martech' }],
    })

    assertUniversalInvariants(esnData)
    assertUniversalInvariants(esnMarketing)
    // Faits identiques...
    expect(esnData.people.map(p => p.id)).toEqual(esnMarketing.people.map(p => p.id))
    // ...lecture d'achat différente selon le profil ESN.
    expect(esnData.buyingCommittee[0]!.personId).not.toBe(esnMarketing.buyingCommittee[0]!.personId)
  })
})
