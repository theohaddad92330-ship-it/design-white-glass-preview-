import { describe, expect, it } from 'vitest'
import { deadlineCards, deadlineTiles, type DeadlineMission } from './planning-deadlines'

const TODAY = '2026-10-22'

function mission(over: Partial<DeadlineMission> = {}): DeadlineMission {
  return {
    id: 'm1',
    label: 'Audit sécurité applicative',
    accountName: 'Thales',
    personNames: ['Inès Kaczmarek'],
    startedOn: '2026-09-01',
    endsOn: '2026-12-30',
    ...over,
  }
}

// Théo C missions-planning.R2 — quatre tuiles d'échéance, sans montant.
describe('deadlineTiles', () => {
  it('compte les missions à accompagner, les fins sous 30 jours, les démarrages prévus et les fins non renseignées', () => {
    const tiles = deadlineTiles(
      [
        mission({ id: 'a' }),
        mission({ id: 'b', endsOn: '2026-10-30' }),
        mission({ id: 'c', startedOn: '2026-11-03', endsOn: '2027-04-30' }),
        mission({ id: 'd', endsOn: null }),
      ],
      TODAY,
    )
    expect(tiles).toEqual({ toAccompany: 4, endingSoon: 1, starting: 1, endUnset: 1 })
  })

  it('une fin absente n’est jamais comptée comme une fin proche, et une fin passée non plus', () => {
    const tiles = deadlineTiles([mission({ endsOn: null }), mission({ id: 'x', endsOn: '2026-10-01' })], TODAY)
    expect(tiles.endingSoon).toBe(0)
    expect(tiles.endUnset).toBe(1)
  })

  it('un démarrage dans le passé ou sans date n’est pas « prévu »', () => {
    const tiles = deadlineTiles([mission({ startedOn: null }), mission({ id: 'y', startedOn: '2026-10-22' })], TODAY)
    expect(tiles.starting).toBe(0)
  })
})

// Théo C missions-planning.N1 — « Les échéances à préparer », des cartes, pas un gestionnaire de tâches.
describe('deadlineCards', () => {
  it('liste les fins et démarrages des 30 prochains jours, du plus proche au plus lointain', () => {
    const cards = deadlineCards(
      [
        mission({ id: 'fin', endsOn: '2026-10-30' }),
        mission({ id: 'deb', label: 'Renfort sécurité', startedOn: '2026-11-03', endsOn: '2027-04-30' }),
        mission({ id: 'loin', endsOn: '2026-12-30' }),
      ],
      TODAY,
    )
    expect(cards.map(card => [card.missionId, card.kind, card.daysUntil])).toEqual([
      ['fin', 'ending', 8],
      ['deb', 'starting', 12],
    ])
  })

  it('une mission sans date ne produit aucune carte', () => {
    expect(deadlineCards([mission({ endsOn: null, startedOn: null })], TODAY)).toEqual([])
  })

  it('une mission qui démarre ET finit dans la fenêtre donne deux cartes', () => {
    const cards = deadlineCards([mission({ startedOn: '2026-10-25', endsOn: '2026-11-10' })], TODAY)
    expect(cards.map(card => card.kind)).toEqual(['starting', 'ending'])
  })
})
