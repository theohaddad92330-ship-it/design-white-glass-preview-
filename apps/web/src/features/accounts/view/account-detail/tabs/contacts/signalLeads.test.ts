import { describe, expect, it } from 'vitest'
import { readSignalLeads } from './signalLeads'

// #4324.1(b) — STEF Transport : un DSI cité dans un signal, aucune fiche contact. La piste est lue telle que le
// signal la donne (nom, fonction), jamais complétée.
describe('readSignalLeads', () => {
  const raw = {
    peopleMentioned: [
      { name: 'Jean Dupont', title: 'DSI', entity: 'STEF Transport', source: 'Les Echos', context: 'nomme un DSI' },
      { name: 'Marie Curie', title: 'Directrice financière', former: false },
      { name: 'Paul Ancien', title: 'DSI', former: true },
      { name: '', title: 'DSI' },
    ],
  }

  it('garde les personnes citées sans fiche, nom et fonction tels que le signal les donne', () => {
    expect(readSignalLeads(raw, [])).toEqual([
      { name: 'Jean Dupont', title: 'DSI', entity: 'STEF Transport' },
      { name: 'Marie Curie', title: 'Directrice financière', entity: null },
    ])
  })

  it('une personne qui a déjà sa fiche (accents, casse) n’est pas une piste ; un contact écarté ne compte pas comme fiche', () => {
    const contacts = [{ full_name: 'jean  dupont' }, { full_name: 'Marie Curie', excluded_at: '2026-10-22T07:00:00Z' }]
    expect(readSignalLeads(raw, contacts).map(lead => lead.name)).toEqual(['Marie Curie'])
  })

  it('aucune donnée inventée : rien de lisible, aucune piste', () => {
    expect(readSignalLeads({}, [])).toEqual([])
    expect(readSignalLeads({ peopleMentioned: 'x' }, [])).toEqual([])
    expect(readSignalLeads({ peopleMentioned: [null, 3, { title: 'DSI' }] }, [])).toEqual([])
  })

  it('un décideur technique (DSI, RSSI…) passe en tête', () => {
    expect(readSignalLeads(raw, []).map(lead => lead.title)).toEqual(['DSI', 'Directrice financière'])
    const reversed = { peopleMentioned: [raw.peopleMentioned[1], raw.peopleMentioned[0]] }
    expect(readSignalLeads(reversed, []).map(lead => lead.name)).toEqual(['Jean Dupont', 'Marie Curie'])
  })
})
