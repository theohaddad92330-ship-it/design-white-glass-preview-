import { describe, expect, it } from 'vitest'
import { preserveNotConfirmedPeople } from './org-graph-refresh-diff.js'
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
}
const MARC = {
  id: 'p-marc',
  fullName: 'Marc Dubois',
  title: 'Directeur Achats',
  entityId: 'e1',
  identityStatus: 'enriched',
  confidence: 70,
}

describe('preserveNotConfirmedPeople — #2554.1 revérifier, #2554.2 nommer le diff', () => {
  it('un premier peuplement (rien de stocké) ne produit aucun diff — distinct de #2502', () => {
    const current = graph({ people: [] })
    const incoming = graph({ people: [CLAIRE] })
    expect(preserveNotConfirmedPeople({ current, incoming, asOf: '2026-09-18T00:00:00.000Z' })).toBeNull()
  })

  it('une personne revenue à l’identique est REVÉRIFIÉE', () => {
    const current = graph({ people: [CLAIRE] })
    const incoming = graph({ people: [CLAIRE] })
    const result = preserveNotConfirmedPeople({ current, incoming, asOf: '2026-09-18T00:00:00.000Z' })
    expect(result?.diff.reverified.map(e => e.personId)).toEqual(['p-claire'])
    expect(result?.diff.changedPosition).toHaveLength(0)
    expect(result?.diff.notConfirmed).toHaveLength(0)
  })

  it('un titre différent au retour est nommé CHANGÉ DE POSTE, avant/après portés', () => {
    const current = graph({ people: [CLAIRE] })
    const incoming = graph({ people: [{ ...CLAIRE, title: 'DSI Groupe' }] })
    const result = preserveNotConfirmedPeople({ current, incoming, asOf: '2026-09-18T00:00:00.000Z' })
    expect(result?.diff.changedPosition).toEqual([
      {
        personId: 'p-claire',
        fullName: 'Claire Perrin',
        kind: 'changedPosition',
        previousTitle: 'DSI',
        nextTitle: 'DSI Groupe',
      },
    ])
    expect(result?.orgGraph.people.find(p => p.id === 'p-claire')?.title).toBe('DSI Groupe')
  })

  it('une personne DÉCOUVERTE par ce run est nommée NOUVELLE', () => {
    const current = graph({ people: [CLAIRE] })
    const incoming = graph({ people: [CLAIRE, MARC] })
    const result = preserveNotConfirmedPeople({ current, incoming, asOf: '2026-09-18T00:00:00.000Z' })
    expect(result?.diff.new.map(e => e.personId)).toEqual(['p-marc'])
  })

  it('une personne STOCKÉE mais absente du run n’est jamais supprimée — nommée NON CONFIRMÉE avec la date', () => {
    const current = graph({ people: [CLAIRE, MARC] })
    const incoming = graph({ people: [CLAIRE] })
    const result = preserveNotConfirmedPeople({ current, incoming, asOf: '2026-09-18T00:00:00.000Z' })
    expect(result?.diff.notConfirmed).toEqual([{ personId: 'p-marc', fullName: 'Marc Dubois', kind: 'notConfirmed' }])
    // Jamais supprimée : elle reste dans le graphe rendu.
    const marc = result?.orgGraph.people.find(p => p.id === 'p-marc')
    expect(marc).toBeDefined()
    expect(marc?.notConfirmedSince).toBe('2026-09-18T00:00:00.000Z')
    // Jamais présentée comme à jour : son ancien titre est conservé tel quel, pas réaffirmé.
    expect(marc?.title).toBe('Directeur Achats')
  })

  it('une personne non confirmée qui revient plus tard perd sa marque — reconfirmée', () => {
    const current = graph({ people: [{ ...MARC, notConfirmedSince: '2026-09-01T00:00:00.000Z' }] })
    const incoming = graph({ people: [MARC] })
    const result = preserveNotConfirmedPeople({ current, incoming, asOf: '2026-09-18T00:00:00.000Z' })
    expect(result?.diff.reverified.map(e => e.personId)).toEqual(['p-marc'])
    expect(result?.orgGraph.people.find(p => p.id === 'p-marc')?.notConfirmedSince).toBeUndefined()
  })

  it('l’entité d’une personne non confirmée est conservée même si le run ne la cite plus', () => {
    const current = graph({
      entities: [
        { id: 'e1', name: 'ACME', type: 'groupe', status: 'operating', confidence: 90 },
        { id: 'e2', name: 'ACME Filiale', type: 'filiale', status: 'operating', confidence: 80 },
      ],
      people: [{ ...MARC, entityId: 'e2' }],
    })
    const incoming = graph({ people: [] })
    const result = preserveNotConfirmedPeople({ current, incoming, asOf: '2026-09-18T00:00:00.000Z' })
    expect(result?.orgGraph.entities.map(e => e.id).sort()).toEqual(['e1', 'e2'])
  })

  it('le graphe rendu reste valide au contrat (`orgGraphSchema`)', () => {
    const current = graph({ people: [CLAIRE, MARC] })
    const incoming = graph({ people: [CLAIRE] })
    const result = preserveNotConfirmedPeople({ current, incoming, asOf: '2026-09-18T00:00:00.000Z' })
    expect(() => orgGraphSchema.parse(result?.orgGraph)).not.toThrow()
  })

  // #2318.4 — « nouvelles entités » : le 6ᵉ des onze champs du diff que
  // LAU-FINAL-059 demande, jusqu'ici absent (aucun mécanisme ne comparait les
  // entités du graphe, seulement les personnes).
  it('une entité apparue dans ce run et absente du graphe stocké est NOUVELLE ENTITÉ', () => {
    const current = graph({ people: [CLAIRE] })
    const incoming = graph({
      entities: [
        { id: 'e1', name: 'ACME', type: 'groupe', status: 'operating', confidence: 90 },
        { id: 'e2', name: 'ACME Digital', type: 'filiale', status: 'operating', confidence: 80 },
      ],
      people: [CLAIRE],
    })
    const result = preserveNotConfirmedPeople({ current, incoming, asOf: '2026-09-18T00:00:00.000Z' })
    expect(result?.diff.newEntities).toEqual([{ entityId: 'e2', name: 'ACME Digital' }])
  })

  it('une entité déjà connue n’est jamais listée comme nouvelle', () => {
    const current = graph({ people: [CLAIRE] })
    const incoming = graph({ people: [CLAIRE] })
    const result = preserveNotConfirmedPeople({ current, incoming, asOf: '2026-09-18T00:00:00.000Z' })
    expect(result?.diff.newEntities).toEqual([])
  })
})
