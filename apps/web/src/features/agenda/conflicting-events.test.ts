import type { AgendaConflict } from '@bellum/contracts'
import { conflictByEventId, conflictingEventIds } from './conflicting-events'

const pair = (first: string, second: string) =>
  ({ first: { id: first }, second: { id: second }, overlapMinutes: 30 }) as unknown as AgendaConflict

describe('conflictingEventIds', () => {
  it('marque les DEUX rendez-vous de chaque paire', () => {
    // N'en marquer qu'un laisserait l'autre passer pour un créneau libre.
    expect([...conflictingEventIds([pair('a', 'b')])].sort()).toEqual(['a', 'b'])
  })

  it('ne compte pas deux fois un rendez-vous présent dans plusieurs paires', () => {
    const ids = conflictingEventIds([pair('a', 'b'), pair('a', 'c')])
    expect(ids.size).toBe(3)
    expect(ids.has('a')).toBe(true)
  })

  it('rend un ensemble vide quand il n’y a pas de conflit', () => {
    expect(conflictingEventIds([]).size).toBe(0)
    expect(conflictingEventIds(undefined).size).toBe(0)
  })

  it('ignore une paire incomplète plutôt que de marquer « undefined »', () => {
    // Une donnée partielle ne doit pas produire une ligne surlignée au hasard.
    expect(conflictingEventIds([{ first: { id: 'a' } } as unknown as AgendaConflict]).size).toBe(1)
  })
})

// #2926 — la carte de la semaine doit pouvoir retrouver, par le SEUL id de
// l'évènement cliqué, le conflit auquel il appartient (pour ouvrir la boîte de
// conflit plutôt que le pré-brief) — même donnée que `conflictingEventIds`,
// indexée différemment plutôt que recalculée (GA-26).
describe('conflictByEventId', () => {
  it('retrouve le conflit depuis CHACUN des deux évènements de la paire', () => {
    const conflict = pair('a', 'b')
    const map = conflictByEventId([conflict])
    expect(map.get('a')).toBe(conflict)
    expect(map.get('b')).toBe(conflict)
  })

  it('rend une table vide en l’absence de conflit', () => {
    expect(conflictByEventId([]).size).toBe(0)
    expect(conflictByEventId(undefined).size).toBe(0)
  })

  it('un évènement absent de tout conflit ne rend rien', () => {
    expect(conflictByEventId([pair('a', 'b')]).get('c')).toBeUndefined()
  })
})
