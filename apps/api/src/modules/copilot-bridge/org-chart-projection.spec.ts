import { projectOrgChart } from './org-chart-projection'

// LOT (15/10) DATA-B.4 — ce que Laura lit de l'onglet Organigramme : la MÊME carte, bornée, sans les personnes écartées.
const source = { id: 's1', kind: 'official_site', grounding: 'A' }
const graph = {
  graphVersion: 3,
  entities: [
    { id: 'e1', name: 'ACME Groupe', type: 'groupe', status: 'operating', sources: [source], confidence: 90 },
    {
      id: 'e2',
      name: 'ACME Digital',
      type: 'filiale',
      parentId: 'e1',
      status: 'operating',
      sources: [source],
      confidence: 80,
    },
  ],
  people: [
    {
      id: 'p1',
      fullName: 'Claire Dubois',
      title: 'DSI',
      entityId: 'e2',
      decisionRoles: ['economic_buyer'],
      identityStatus: 'verified_identity',
      sources: [source],
      confidence: 85,
    },
    {
      id: 'p2',
      fullName: 'Éric Martin',
      title: 'Directeur Data',
      entityId: 'e2',
      decisionRoles: [],
      identityStatus: 'classified',
      sources: [source],
      confidence: 60,
    },
  ],
  hierarchyEdges: [{ fromId: 'p2', toId: 'p1', type: 'reports_to', sourceIds: ['s1'], confidence: 90, verified: true }],
  influenceEdges: [],
  relationalEdges: [],
  buyingCommittee: [{ personId: 'p1', role: 'economic_buyer', entityId: 'e2', accessScore: 70 }],
  uncoveredZones: [],
  recommendedPath: [{ step: 1, personId: 'p2', objective: 'Ouvrir par la data' }],
  rejectedItems: [],
}

describe('projectOrgChart', () => {
  it('rend la carte lue, avec ses noms résolus et ses comptes', () => {
    const out = projectOrgChart({ orgGraph: graph }, [])
    expect(out.status).toBe('ok')
    if (out.status !== 'ok') return
    expect(out.counts).toEqual({ entities: 2, people: 2, verified_lines: 1, inferred_lines: 0 })
    expect(out.people.map(p => p.full_name)).toEqual(['Claire Dubois', 'Éric Martin'])
    expect(out.people[0]).toMatchObject({ title: 'DSI', entity: 'ACME Digital', decision_roles: ['economic_buyer'] })
    expect(out.verified_lines[0]).toMatchObject({ from: 'Éric Martin', to: 'Claire Dubois', type: 'reports_to' })
    expect(out.buying_committee[0]).toMatchObject({ person: 'Claire Dubois', role: 'economic_buyer' })
    expect(out.recommended_path[0]).toMatchObject({ step: 1, person: 'Éric Martin' })
  })

  it('retire une personne écartée et tout ce qui la cite (mêmes règles que l’écran)', () => {
    const out = projectOrgChart({ orgGraph: graph }, ['claire dubois'])
    if (out.status !== 'ok') throw new Error('attendu ok')
    expect(out.people.map(p => p.full_name)).toEqual(['Éric Martin'])
    expect(out.counts.verified_lines).toBe(0)
    expect(out.buying_committee).toEqual([])
  })

  it('l’ordre prénom/nom et les accents ne contournent pas l’exclusion', () => {
    const out = projectOrgChart({ orgGraph: graph }, ['martin eric'])
    if (out.status !== 'ok') throw new Error('attendu ok')
    expect(out.people.map(p => p.full_name)).toEqual(['Claire Dubois'])
  })

  it('sans graphe — ou graphe illisible — le DIT, sans rien inventer', () => {
    expect(projectOrgChart(null, [])).toEqual({ status: 'no_graph' })
    expect(projectOrgChart({}, [])).toEqual({ status: 'no_graph' })
    expect(projectOrgChart({ orgGraph: { people: 'x' } }, [])).toEqual({ status: 'no_graph' })
  })

  it('borne les personnes et dit combien sont laissées de côté', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      id: `q${i}`,
      fullName: `Personne ${i}`,
      entityId: 'e2',
      decisionRoles: [],
      identityStatus: 'classified',
      sources: [],
      confidence: 50,
    }))
    const out = projectOrgChart(
      { orgGraph: { ...graph, people: many, hierarchyEdges: [], buyingCommittee: [], recommendedPath: [] } },
      [],
    )
    if (out.status !== 'ok') throw new Error('attendu ok')
    expect(out.people.length).toBeLessThanOrEqual(25)
    expect(out.counts.people).toBe(60)
    expect(out.people_not_shown).toBe(60 - out.people.length)
  })
})
