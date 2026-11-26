import { describe, expect, it } from 'vitest'
import { groupRecommendations } from './partners-recommendation-groups'

const line = (name: string, play = 'find_out', partner: string | null = null) => ({
  entity_id: null,
  entity_name: name,
  play,
  partner,
  reason: `raison ${play}`,
})

describe('groupRecommendations (#3464)', () => {
  it('fusionne les doublons de nom (accents, casse, « — Groupe »)', () => {
    const groups = groupRecommendations([
      line('Societe Generale'),
      line('Société Générale'),
      line('Société Générale — Groupe'),
      line('Société Générale — Groupe'),
      line('Société Générale Private Banking'),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0]?.items.map(i => i.entity_name)).toEqual(['Societe Generale', 'Société Générale Private Banking'])
  })

  it('fusionne « Maison mère — Périmètre » avec « Périmètre » et « — Groupe (…) » avec la maison mère', () => {
    const groups = groupRecommendations([
      line('Société Générale'),
      line('Societe Generale'),
      line('Société Générale — Groupe (entité exacte à confirmer)'),
      line('Société Générale — Banque de détail et services financiers internationaux'),
      line('Banque de détail et services financiers internationaux'),
      line('Société Générale — Groupe / Banque de grande clientèle et solutions investisseurs'),
      line('Banque de grande clientèle et solutions investisseurs'),
    ])
    expect(groups[0]?.items).toHaveLength(3)
  })

  it('une issue = un groupe, et le même nom via deux partenaires reste deux lignes', () => {
    const groups = groupRecommendations([
      line('A', 'find_out'),
      line('B', 'through_partner', 'P1'),
      line('B', 'through_partner', 'P2'),
      line('C', 'find_out'),
    ])
    expect(groups.map(g => g.play)).toEqual(['find_out', 'through_partner'])
    expect(groups[1]?.items).toHaveLength(2)
  })

  it('le résidu ferme son groupe', () => {
    const groups = groupRecommendations([line('Périmètre non déterminé'), line('Filiale X')])
    expect(groups[0]?.items.map(i => i.entity_name)).toEqual(['Filiale X', 'Périmètre non déterminé'])
  })
})
