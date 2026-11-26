import { orgGraphSchema, type OrgGraph } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { unenrichedOrgContacts } from './focalOrgData'
import { knownOrgContacts } from './knownOrgContacts'

const SOURCE = { id: 's1', kind: 'official_site' as const, grounding: 'A' as const, date: '2026-08-01' }

function graph(people: Record<string, unknown>[] = []): OrgGraph {
  return orgGraphSchema.parse({
    graphVersion: 3,
    entities: [{ id: 'e-vicat', name: 'VICAT', type: 'groupe', parentId: null, confidence: 95, sources: [SOURCE] }],
    people: people.map(over => ({
      identityStatus: 'classified',
      confidence: 60,
      sources: [],
      decisionRoles: [],
      entityId: 'e-vicat',
      ...over,
    })),
    hierarchyEdges: [],
    buyingCommittee: [],
    recommendedPath: [],
  })
}

type C = {
  id: string
  full_name: string
  title?: string | null
  entity?: string | null
  family?: string | null
  source?: string | null
}
const ciso: C = { id: 'c-didier', full_name: 'Didier Montandon', title: 'CISO', family: 'Cyber', source: 'import' }
const found: C = { id: 'c-x', full_name: 'Inconnu Un', title: 'Développeur', source: 'apollo' }

describe('G1 — un contact connu (import / crm) n’est JAMAIS dans « Non enrichis »', () => {
  it('le seau « non enrichis » écarte les contacts connus', () => {
    const out = unenrichedOrgContacts(graph(), [
      ciso,
      found,
      { ...ciso, id: 'c2', full_name: 'Autre Crm', source: 'crm' },
    ])
    expect(out.map(c => c.fullName)).toEqual(['Inconnu Un'])
  })

  it('sait dire NON : sans le prédicat un contact importé y retombe — la garde lit la provenance', () => {
    const noProvenance = { ...ciso, source: null }
    expect(unenrichedOrgContacts(graph(), [noProvenance]).map(c => c.fullName)).toEqual(['Didier Montandon'])
  })
})

describe('knownOrgContacts — placement', () => {
  it('place un contact connu dont le titre donne un niveau (CISO → L1)', () => {
    const { placed, pinned } = knownOrgContacts(graph(), [ciso, found], new Set(['vicat']))
    expect(placed.map(c => [c.fullName, c.level])).toEqual([['Didier Montandon', 'L1']])
    expect(pinned).toEqual([])
  })

  it('épingle (« Connus de l’équipe ») un connu sans titre exploitable, plusieurs possibles', () => {
    const a: C = { id: 'a', full_name: 'A Sans Titre', title: null, source: 'import' }
    const b: C = { id: 'b', full_name: 'B Illisible', title: '—', source: 'crm' }
    const { placed, pinned } = knownOrgContacts(graph(), [a, b], new Set(['vicat']))
    expect(placed).toEqual([])
    expect(pinned.map(c => c.fullName)).toEqual(['A Sans Titre', 'B Illisible'])
  })

  it('épingle un connu rattaché à une autre entité que la direction ouverte (jamais perdu)', () => {
    const elsewhere: C = { ...ciso, entity: 'Autre filiale' }
    const { placed, pinned } = knownOrgContacts(graph(), [elsewhere], new Set(['vicat']))
    expect(placed).toEqual([])
    expect(pinned).toHaveLength(1)
  })

  it('un titre achats (L5, canal parallèle) est épinglé, pas rangé dans l’arbre', () => {
    const buyer: C = { id: 'p', full_name: 'Acheteur', title: 'Responsable achats', source: 'import' }
    const { placed, pinned } = knownOrgContacts(graph(), [buyer], new Set(['vicat']))
    expect(placed).toEqual([])
    expect(pinned.map(c => c.fullName)).toEqual(['Acheteur'])
  })

  it('aucun contact connu ⇒ rien (ni bloc, ni zéro)', () => {
    expect(knownOrgContacts(graph(), [found], new Set())).toEqual({ placed: [], pinned: [] })
  })

  it('un connu déjà présent comme nœud du graphe n’est pas montré une seconde fois', () => {
    const g = graph([{ id: 'p-didier', fullName: 'Didier Montandon', hierarchyLevel: 'L1' }])
    expect(knownOrgContacts(g, [ciso], new Set(['vicat']))).toEqual({ placed: [], pinned: [] })
  })
})

describe('knownOrgContacts — doublon probable (on propose, on ne fusionne JAMAIS)', () => {
  const inferred = {
    id: 'p-ref',
    fullName: 'Référent technique',
    title: 'Référent technique',
    hierarchyLevel: 'L1',
    family: 'Cyber',
    roleInferred: true,
  }

  it('même famille + même niveau qu’un contact déduit ⇒ doublon probable nommé', () => {
    const { placed } = knownOrgContacts(graph([inferred]), [ciso], new Set(['vicat']))
    expect(placed[0]?.probableDuplicate).toEqual({ personId: 'p-ref', fullName: 'Référent technique' })
  })

  it('titres équivalents au même niveau ⇒ doublon probable', () => {
    const g = graph([{ ...inferred, family: undefined, title: 'C.I.S.O' }])
    const same: C = { ...ciso, family: null, title: 'ciso' }
    expect(knownOrgContacts(g, [same], new Set(['vicat'])).placed[0]?.probableDuplicate?.personId).toBe('p-ref')
  })

  it('un autre niveau ⇒ aucun doublon', () => {
    const g = graph([{ ...inferred, hierarchyLevel: 'L3' }])
    expect(knownOrgContacts(g, [ciso], new Set(['vicat'])).placed[0]?.probableDuplicate).toBeNull()
  })

  it('une personne OBSERVÉE (rôle non déduit) n’est jamais présentée comme doublon', () => {
    const g = graph([{ ...inferred, roleInferred: false }])
    expect(knownOrgContacts(g, [ciso], new Set(['vicat'])).placed[0]?.probableDuplicate).toBeNull()
  })

  it('ne modifie ni le graphe ni le contact (aucune fusion, aucun champ écrasé)', () => {
    const g = graph([inferred])
    const before = JSON.stringify(g)
    const contact = { ...ciso }
    knownOrgContacts(g, [contact], new Set(['vicat']))
    expect(JSON.stringify(g)).toBe(before)
    expect(contact).toEqual(ciso)
  })
})
