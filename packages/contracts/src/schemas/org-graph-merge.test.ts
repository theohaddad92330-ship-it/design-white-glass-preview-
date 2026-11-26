import { describe, expect, it } from 'vitest'
import { mergeOrgGraphDelta } from './org-graph-merge.js'
import { orgGraphSchema, type OrgGraph } from './org-graph.js'

function graph(partial: Partial<Record<string, unknown>>): OrgGraph {
  return orgGraphSchema.parse({
    entities: [{ id: 'e1', name: 'ACME', type: 'groupe', status: 'operating', confidence: 90 }],
    ...partial,
  })
}

const CLAIRE = {
  id: 'p-claire',
  fullName: 'Claire Perrin',
  title: 'DSI',
  entityId: 'e1',
  identityStatus: 'enriched',
  confidence: 80,
  family: 'IT',
}
const MARC = {
  id: 'p-marc',
  fullName: 'Marc Dubois',
  title: 'Directeur Achats',
  entityId: 'e1',
  identityStatus: 'enriched',
  confidence: 70,
  family: 'Achat',
}

describe('mergeOrgGraphDelta — seules les personnes TOUCHÉES sont recalculées', () => {
  it('une personne hors de la vague ne bouge pas — c’est tout le lot', () => {
    const current = graph({ people: [CLAIRE, MARC] })
    // La vague n'a vu que Claire ; le graphe qu'elle rend ne contient qu'elle.
    const incoming = graph({ people: [{ ...CLAIRE, title: 'Directrice des SI' }] })

    const merged = mergeOrgGraphDelta({ current, incoming, touchedPersonIds: ['p-claire'] })

    expect(merged.people).toHaveLength(2)
    expect(merged.people.find(p => p.id === 'p-claire')?.title).toBe('Directrice des SI')
    // Marc a survécu à une vague qui ne l'a jamais vu.
    expect(merged.people.find(p => p.id === 'p-marc')?.title).toBe('Directeur Achats')
  })

  it('une personne DÉCOUVERTE par la vague est ajoutée', () => {
    const current = graph({ people: [CLAIRE] })
    const incoming = graph({ people: [CLAIRE, MARC] })
    const merged = mergeOrgGraphDelta({ current, incoming, touchedPersonIds: ['p-claire'] })
    expect(merged.people.map(p => p.id).sort()).toEqual(['p-claire', 'p-marc'])
  })

  it('une personne touchée mais ABSENTE du résultat n’est pas supprimée', () => {
    const current = graph({ people: [CLAIRE, MARC] })
    const incoming = graph({ people: [CLAIRE] })
    const merged = mergeOrgGraphDelta({ current, incoming, touchedPersonIds: ['p-claire', 'p-marc'] })
    expect(merged.people).toHaveLength(2)
  })

  it('un run COMPLET (aucune personne nommée) reste un remplacement — chemin d’avant', () => {
    const current = graph({ people: [CLAIRE, MARC] })
    const incoming = graph({ people: [CLAIRE] })
    const merged = mergeOrgGraphDelta({ current, incoming, touchedPersonIds: [] })
    expect(merged).toBe(incoming)
  })
})

describe('mergeOrgGraphDelta — une correction humaine gagne toujours', () => {
  it('un champ corrigé par un humain n’est jamais réécrit par une vague', () => {
    const current = graph({ people: [{ ...CLAIRE, title: 'Directrice des Systèmes d’Information' }] })
    const incoming = graph({ people: [{ ...CLAIRE, title: 'DSI Groupe' }] })

    const merged = mergeOrgGraphDelta({
      current,
      incoming,
      touchedPersonIds: ['p-claire'],
      humanHeldFields: { 'p-claire': ['title'] },
    })
    expect(merged.people[0]?.title).toBe('Directrice des Systèmes d’Information')
  })

  it('les AUTRES champs de la même personne restent rafraîchissables', () => {
    const current = graph({ people: [{ ...CLAIRE, title: 'Corrigé à la main', family: 'Autre' }] })
    const incoming = graph({ people: [{ ...CLAIRE, title: 'DSI Groupe', family: 'IT' }] })

    const merged = mergeOrgGraphDelta({
      current,
      incoming,
      touchedPersonIds: ['p-claire'],
      humanHeldFields: { 'p-claire': ['title'] },
    })
    expect(merged.people[0]?.title).toBe('Corrigé à la main')
    expect(merged.people[0]?.family).toBe('IT')
  })

  it('un blanc du modèle n’efface jamais une valeur connue', () => {
    const current = graph({ people: [CLAIRE] })
    const incoming = graph({ people: [{ ...CLAIRE, title: '' }] })
    const merged = mergeOrgGraphDelta({ current, incoming, touchedPersonIds: ['p-claire'] })
    expect(merged.people[0]?.title).toBe('DSI')
  })

  it('`lastVerifiedAt` traverse une vague — une vague ne vérifie rien', () => {
    const current = graph({ people: [{ ...CLAIRE, lastVerifiedAt: '2026-08-01T00:00:00.000Z' }] })
    const incoming = graph({ people: [{ ...CLAIRE, title: 'DSI Groupe' }] })
    const merged = mergeOrgGraphDelta({ current, incoming, touchedPersonIds: ['p-claire'] })
    expect(merged.people[0]?.lastVerifiedAt).toBe('2026-08-01T00:00:00.000Z')
  })
})

describe('mergeOrgGraphDelta — les liens s’ajoutent, ils ne se retirent pas', () => {
  const edge = (over: Partial<Record<string, unknown>> = {}) => ({
    fromId: 'p-marc',
    toId: 'p-claire',
    type: 'reports_to',
    sourceIds: ['s1'],
    confidence: 95,
    verified: true,
    ...over,
  })

  it('un lien du graphe courant survit à une vague qui ne le mentionne pas', () => {
    const current = graph({ people: [CLAIRE, MARC], hierarchyEdges: [edge()] })
    const incoming = graph({ people: [CLAIRE] })
    const merged = mergeOrgGraphDelta({ current, incoming, touchedPersonIds: ['p-claire'] })
    expect(merged.hierarchyEdges).toHaveLength(1)
  })

  it('un lien VÉRIFIÉ ne se dégrade pas parce que la vague ne l’a pas réaffirmé', () => {
    const current = graph({
      people: [CLAIRE, MARC],
      hierarchyEdges: [edge({ lastVerifiedAt: '2026-07-01T00:00:00.000Z' })],
    })
    const incoming = graph({
      people: [CLAIRE, MARC],
      hierarchyEdges: [edge({ verified: false, confidence: 60, sourceIds: [] })],
    })
    const merged = mergeOrgGraphDelta({ current, incoming, touchedPersonIds: ['p-claire', 'p-marc'] })
    expect(merged.hierarchyEdges[0]?.verified).toBe(true)
    expect(merged.hierarchyEdges[0]?.lastVerifiedAt).toBe('2026-07-01T00:00:00.000Z')
  })

  it('les preuves d’un lien s’ACCUMULENT — une vague n’en remplace pas la liste', () => {
    const current = graph({ people: [CLAIRE, MARC], hierarchyEdges: [edge({ sourceIds: ['s1'] })] })
    const incoming = graph({
      people: [CLAIRE, MARC],
      hierarchyEdges: [edge({ sourceIds: ['s2'], confidence: 92 })],
    })
    const merged = mergeOrgGraphDelta({ current, incoming, touchedPersonIds: ['p-claire', 'p-marc'] })
    expect(merged.hierarchyEdges[0]?.sourceIds.sort()).toEqual(['s1', 's2'])
  })

  it('un lien dont un bout est INCONNU du graphe fusionné est écarté', () => {
    const current = graph({ people: [CLAIRE] })
    // Volontairement NON validé : un graphe entrant peut être incohérent (le
    // modèle nomme quelqu'un qu'il n'a pas mis dans `people`), et c'est
    // précisément le cas que la fusion doit refuser de propager.
    const incoming = {
      ...graph({ people: [CLAIRE] }),
      hierarchyEdges: [edge({ fromId: 'p-fantome', confidence: 40, verified: false, sourceIds: [] })],
    } as unknown as OrgGraph
    const merged = mergeOrgGraphDelta({ current, incoming, touchedPersonIds: ['p-claire'] })
    expect(merged.hierarchyEdges).toEqual([])
    // Et le résultat reste un graphe VALIDE, invariants compris.
    expect(orgGraphSchema.safeParse(merged).success).toBe(true)
  })
})

describe('mergeOrgGraphDelta — ce qui décrit le graphe ENTIER n’est pas remesuré sur 50 personnes', () => {
  it('la couverture du graphe courant est conservée, pas remplacée par celle du lot', () => {
    const current = graph({
      people: [CLAIRE, MARC],
      coverage: { discovered: 2241, deterministicClassified: 300, llmEnriched: 50 },
    })
    const incoming = graph({
      people: [CLAIRE],
      coverage: { discovered: 50, deterministicClassified: 50, llmEnriched: 50 },
    })
    const merged = mergeOrgGraphDelta({ current, incoming, touchedPersonIds: ['p-claire'] })
    expect(merged.coverage?.discovered).toBe(2241)
  })

  it('le chemin recommandé du graphe courant est conservé', () => {
    const current = graph({
      people: [CLAIRE, MARC],
      recommendedPath: [{ step: 1, personId: 'p-marc', objective: 'ouvrir' }],
    })
    const incoming = graph({
      people: [CLAIRE],
      recommendedPath: [{ step: 1, personId: 'p-claire', objective: 'autre' }],
    })
    const merged = mergeOrgGraphDelta({ current, incoming, touchedPersonIds: ['p-claire'] })
    expect(merged.recommendedPath.map(step => step.personId)).toEqual(['p-marc'])
  })

  it('un élément ÉCARTÉ par la vague sort du graphe fusionné, partout', () => {
    const current = graph({
      people: [CLAIRE, MARC],
      buyingCommittee: [{ personId: 'p-marc', role: 'procurement' }],
      recommendedPath: [{ step: 1, personId: 'p-marc', objective: 'ouvrir' }],
    })
    const incoming = graph({ people: [CLAIRE], rejectedItems: [{ sourceId: 'p-marc', reason: 'a quitté' }] })
    const merged = mergeOrgGraphDelta({ current, incoming, touchedPersonIds: ['p-claire'] })

    expect(merged.people.map(p => p.id)).toEqual(['p-claire'])
    expect(merged.buyingCommittee).toEqual([])
    expect(merged.recommendedPath).toEqual([])
    expect(orgGraphSchema.safeParse(merged).success).toBe(true)
  })

  it('la version du graphe ne RECULE jamais', () => {
    const current = graph({ graphVersion: 7, people: [CLAIRE] })
    const incoming = graph({ graphVersion: 2, people: [CLAIRE] })
    const merged = mergeOrgGraphDelta({ current, incoming, touchedPersonIds: ['p-claire'] })
    expect(merged.graphVersion).toBe(7)
  })
})
