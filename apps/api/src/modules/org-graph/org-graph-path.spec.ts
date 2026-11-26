import { orgGraphSchema, type OrgGraph } from '@bellum/contracts'
import { readRelationshipState, recomputeRecommendedPath } from './org-graph-path'

/**
 * « Recalculer le chemin » (annexe organigramme §6) : réordonner la séquence
 * d'approche depuis le graphe STOCKÉ, sans relancer la moindre recherche.
 */

/** Personne minimale valide — le test ne pose que ce qu'il exerce. */
function person(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    fullName: id.replace('p-', '').replace('-', ' '),
    identityStatus: 'classified',
    confidence: 70,
    decisionRoles: [],
    ...overrides,
  }
}

function graph(overrides: Partial<Record<string, unknown>> = {}): OrgGraph {
  return orgGraphSchema.parse({
    graphVersion: 3,
    entities: [{ id: 'e-tf1', name: 'TF1', type: 'groupe', parentId: null, confidence: 90 }],
    people: [
      person('p-champion', { decisionRoles: ['champion'], hierarchyLevel: 'L3' }),
      person('p-budget', { decisionRoles: ['economic_buyer'], hierarchyLevel: 'L1' }),
      person('p-achats', { decisionRoles: ['procurement'], hierarchyLevel: 'L5' }),
    ],
    hierarchyEdges: [],
    influenceEdges: [],
    buyingCommittee: [],
    uncoveredZones: [],
    recommendedPath: [
      { step: 1, personId: 'p-achats', objective: 'sécuriser le référencement' },
      { step: 2, personId: 'p-budget', objective: 'obtenir le budget 2027' },
    ],
    rejectedItems: [],
    ...overrides,
  })
}

describe('recomputeRecommendedPath', () => {
  it('réordonne par rôle d’achat : on ouvre par le champion, les achats ferment', () => {
    const next = recomputeRecommendedPath(graph(), { version: 4 })

    expect(next?.recommendedPath.map(s => s.personId)).toEqual(['p-champion', 'p-budget', 'p-achats'])
    expect(next?.recommendedPath.map(s => s.step)).toEqual([1, 2, 3])
    expect(next?.graphVersion).toBe(4)
  })

  it('conserve l’objectif rédigé par l’IA et n’en invente un que pour une personne qui entre', () => {
    const next = recomputeRecommendedPath(graph(), { version: 4 })

    // Déjà dans le chemin → texte d'origine intact.
    expect(next?.recommendedPath.find(s => s.personId === 'p-budget')?.objective).toBe('obtenir le budget 2027')
    // Entre dans le chemin → objectif générique dérivé du RÔLE, aucun fait inventé.
    expect(next?.recommendedPath.find(s => s.personId === 'p-champion')?.objective).toContain('introduction')
  })

  it('n’enrôle jamais un rejeté, un ex-employé, un stock brut ni un opposant', () => {
    const next = recomputeRecommendedPath(
      graph({
        people: [
          person('p-champion', { decisionRoles: ['champion'], hierarchyLevel: 'L3' }),
          person('p-parti', { decisionRoles: ['economic_buyer'], identityStatus: 'historical' }),
          person('p-brut', { decisionRoles: ['user_buyer'], identityStatus: 'seed' }),
          person('p-opposant', { decisionRoles: ['blocker'] }),
        ],
        recommendedPath: [],
        rejectedItems: [{ sourceId: 'p-ecarte', reason: 'signalé parti' }],
      }),
      { version: 4 },
    )

    expect(next?.recommendedPath.map(s => s.personId)).toEqual(['p-champion'])
  })

  it('sur un compte froid, la gouvernance ne passe pas devant l’opérationnel', () => {
    const cold = graph({
      people: [
        person('p-board', { decisionRoles: ['champion'], hierarchyLevel: 'L0' }),
        person('p-terrain', { decisionRoles: ['user_buyer'], hierarchyLevel: 'L3' }),
      ],
      recommendedPath: [],
    })

    // Froid (défaut sûr : état absent ou inconnu = froid).
    expect(recomputeRecommendedPath(cold, { version: 4 })?.recommendedPath.map(s => s.personId)).toEqual([
      'p-terrain',
      'p-board',
    ])
    // Relation établie : le champion de gouvernance redevient une porte d'entrée.
    expect(
      recomputeRecommendedPath(cold, { version: 4, relationshipState: 'client_actif' })?.recommendedPath.map(
        s => s.personId,
      ),
    ).toEqual(['p-board', 'p-terrain'])
  })

  it('laisse un chemin 100 % gouvernance intact : masquer les seuls contacts serait pire', () => {
    const boardOnly = graph({
      people: [
        person('p-president', { decisionRoles: ['economic_buyer'], hierarchyLevel: 'L0', confidence: 90 }),
        person('p-administrateur', { decisionRoles: ['influencer'], hierarchyLevel: 'L0', confidence: 60 }),
      ],
      recommendedPath: [],
    })

    expect(recomputeRecommendedPath(boardOnly, { version: 4 })?.recommendedPath).toHaveLength(2)
  })

  it('le rôle du comité prime sur la fiche, et l’accessibilité départage à rang égal', () => {
    const next = recomputeRecommendedPath(
      graph({
        people: [
          person('p-a', { decisionRoles: ['unknown'], confidence: 50 }),
          person('p-b', { decisionRoles: ['champion'], confidence: 50 }),
        ],
        buyingCommittee: [
          { personId: 'p-a', role: 'champion', accessScore: 90 },
          { personId: 'p-b', role: 'champion', accessScore: 40 },
        ],
        recommendedPath: [],
      }),
      { version: 4 },
    )

    expect(next?.recommendedPath.map(s => s.personId)).toEqual(['p-a', 'p-b'])
  })

  it('rend null quand il n’y a aucun interlocuteur actionnable — jamais un faux succès', () => {
    const empty = graph({ people: [], recommendedPath: [], buyingCommittee: [] })
    expect(recomputeRecommendedPath(empty, { version: 4 })).toBeNull()
  })

  it('borne la séquence : un chemin reste jouable, pas un annuaire', () => {
    const many = graph({
      people: Array.from({ length: 9 }, (_, i) => person(`p-${i}`, { decisionRoles: ['user_buyer'] })),
      recommendedPath: [],
      buyingCommittee: [],
    })

    expect(recomputeRecommendedPath(many, { version: 4 })?.recommendedPath).toHaveLength(5)
  })
})

describe('readRelationshipState', () => {
  it('lit l’état de la relation du dossier stocké', () => {
    expect(readRelationshipState({ salesContext: { relationship: { state: 'dormant' } } })).toBe('dormant')
  })

  it('rend null sur un dossier sans SalesContext — l’appelant retombe sur « froid »', () => {
    expect(readRelationshipState(null)).toBeNull()
    expect(readRelationshipState({ salesContext: {} })).toBeNull()
    expect(readRelationshipState({ salesContext: { relationship: { state: 42 } } })).toBeNull()
  })
})
