import { orgGraphSchema, type OrgGraph } from '@bellum/contracts'
import { recomputeRecommendedPath } from './org-graph-path'

/**
 * GOLDEN SETS — volet CHEMIN (Annexe Organigramme p29/p32).
 *
 * Le golden côté contrat (`packages/contracts/.../org-graph.golden.test.ts`)
 * verrouille la FORME du graphe. Ici on verrouille les invariants du CHEMIN
 * recommandé, qui vivent dans le resolver déterministe (`recomputeRecommendedPath`) :
 *
 *   · sur un compte FROID, la gouvernance (L0) ne passe pas devant l'opérationnel ;
 *   · un contact rejeté n'entre JAMAIS dans le chemin ;
 *   · deux profils ESN (relations différentes) produisent un chemin différent à
 *     partir du même graphe de faits — la séquence est tactique, pas figée.
 */

function graph(over: Partial<OrgGraph>): OrgGraph {
  return orgGraphSchema.parse({
    graphVersion: 1,
    entities: [{ id: 'e', name: 'Cible', type: 'groupe', parentId: null, confidence: 85, status: 'operating' }],
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

const board = {
  id: 'p-board',
  fullName: 'Board Member',
  entityId: 'e',
  hierarchyLevel: 'L0' as const,
  decisionRoles: ['economic_buyer' as const],
  identityStatus: 'classified' as const,
  confidence: 88,
  sources: [],
}
const champion = {
  id: 'p-champ',
  fullName: 'Field Champion',
  entityId: 'e',
  hierarchyLevel: 'L3' as const,
  decisionRoles: ['champion' as const],
  identityStatus: 'classified' as const,
  confidence: 70,
  sources: [],
}
/** Opérationnel de RANG FAIBLE (rôle inconnu) : sans le garde-fou froid, il
 *  passerait DERRIÈRE le board (economic_buyer). C'est ce qui prouve l'effet du
 *  garde — pas un champion, qui devance le board par son seul rang. */
const lowRankOperational = {
  id: 'p-ops',
  fullName: 'Ops Terrain',
  entityId: 'e',
  hierarchyLevel: 'L3' as const,
  decisionRoles: ['unknown' as const],
  identityStatus: 'classified' as const,
  confidence: 60,
  sources: [],
}

describe('OrgGraph golden — chemin recommandé (p29/p32)', () => {
  it('à froid : la gouvernance (L0) passe DERRIÈRE l’opérationnel, même mieux classée', () => {
    // board = economic_buyer (rang meilleur) ; ops = rôle inconnu (rang pire).
    // Sans garde-fou, le board ouvrirait ; à froid, l'opérationnel passe devant.
    const next = recomputeRecommendedPath(graph({ people: [board, lowRankOperational] }), {
      version: 2,
      relationshipState: null, // froid
    })
    expect(next).not.toBeNull()
    expect(next!.recommendedPath[0]!.personId).toBe('p-ops')
    expect(next!.recommendedPath.map(s => s.personId)).toContain('p-board')
  })

  it('à chaud (relation établie), la gouvernance reprend son rang devant un opérationnel moins bien classé', () => {
    const next = recomputeRecommendedPath(graph({ people: [board, lowRankOperational] }), {
      version: 2,
      relationshipState: 'client_actif', // chaud
    })
    // Garde-fou froid désactivé : le board (rang economic_buyer) devance l'ops
    // (rang inconnu).
    expect(next!.recommendedPath[0]!.personId).toBe('p-board')
  })

  it('un contact au statut « rejeté » n’entre jamais dans le chemin', () => {
    const next = recomputeRecommendedPath(
      graph({ people: [champion, { ...board, id: 'p-rej', identityStatus: 'rejected' }] }),
      { version: 2, relationshipState: 'client_actif' },
    )
    expect(next!.recommendedPath.map(s => s.personId)).not.toContain('p-rej')
    expect(next!.recommendedPath.map(s => s.personId)).toContain('p-champ')
  })

  it('un ex-employé (historical) est un capteur, pas une étape d’approche', () => {
    const next = recomputeRecommendedPath(
      graph({ people: [champion, { ...board, id: 'p-ex', identityStatus: 'historical' }] }),
      { version: 2, relationshipState: 'client_actif' },
    )
    expect(next!.recommendedPath.map(s => s.personId)).not.toContain('p-ex')
  })

  it('un opposant identifié (blocker) n’est jamais une porte d’entrée', () => {
    const next = recomputeRecommendedPath(
      graph({
        people: [champion, { ...board, id: 'p-bloc', decisionRoles: ['blocker'] }],
      }),
      { version: 2, relationshipState: 'client_actif' },
    )
    expect(next!.recommendedPath.map(s => s.personId)).not.toContain('p-bloc')
  })

  it('deux profils ESN : même graphe de faits, chemin d’ouverture différent', () => {
    // Mêmes personnes ; ce qui change, c'est le comité (la lecture d'achat du
    // profil ESN) — et le chemin s'ouvre par le siège prioritaire de chacun.
    const people = [
      {
        id: 'p-cto',
        fullName: 'CTO',
        entityId: 'e',
        hierarchyLevel: 'L1' as const,
        decisionRoles: ['technical_buyer' as const],
        identityStatus: 'classified' as const,
        confidence: 82,
        sources: [],
      },
      {
        id: 'p-cmo',
        fullName: 'CMO',
        entityId: 'e',
        hierarchyLevel: 'L1' as const,
        decisionRoles: ['economic_buyer' as const],
        identityStatus: 'classified' as const,
        confidence: 80,
        sources: [],
      },
      {
        id: 'p-champ',
        fullName: 'Champion',
        entityId: 'e',
        hierarchyLevel: 'L3' as const,
        decisionRoles: ['champion' as const],
        identityStatus: 'classified' as const,
        confidence: 78,
        sources: [],
      },
    ]
    const esnData = recomputeRecommendedPath(
      graph({
        people,
        buyingCommittee: [
          { personId: 'p-cto', role: 'champion', entityId: 'e', reason: 'offre data', accessScore: 95 },
        ],
      }),
      { version: 2, relationshipState: 'client_actif' },
    )
    const esnMartech = recomputeRecommendedPath(
      graph({
        people,
        buyingCommittee: [
          { personId: 'p-cmo', role: 'champion', entityId: 'e', reason: 'offre martech', accessScore: 95 },
        ],
      }),
      { version: 2, relationshipState: 'client_actif' },
    )
    // Le siège promu champion (accès 95) ouvre le chemin — différent selon l'ESN.
    expect(esnData!.recommendedPath[0]!.personId).toBe('p-cto')
    expect(esnMartech!.recommendedPath[0]!.personId).toBe('p-cmo')
  })
})
