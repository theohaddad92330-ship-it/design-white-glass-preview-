import { describe, expect, it } from 'vitest'
import { syncAgo, syncIn } from './crm-sync-when'

const NOW = new Date('2026-10-19T12:00:00.000Z')
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000).toISOString()
const minutesAhead = (n: number) => new Date(NOW.getTime() + n * 60_000).toISOString()

describe('syncAgo', () => {
  it('« il y a 6 min » pour un passage récent', () => {
    expect(syncAgo(minutesAgo(6), NOW, 'fr')).toEqual({ kind: 'ago', text: expect.stringMatching(/6\s*min/) })
  })
  it('en anglais aussi', () => {
    expect(syncAgo(minutesAgo(6), NOW, 'en')).toEqual({ kind: 'ago', text: expect.stringMatching(/6\s*min/) })
  })
  it('moins d’une minute : à l’instant', () => {
    expect(syncAgo(minutesAgo(0), NOW, 'fr')).toEqual({ kind: 'now' })
  })
  // #recette-21-10-K2 — une date illisible n'est pas « à l'instant ».
  it('⚠️ une date illisible ne rend PAS « à l’instant » : null', () => {
    expect(syncAgo('garbage', NOW, 'fr')).toBeNull()
    expect(syncAgo('', NOW, 'fr')).toBeNull()
  })
  it('en heures puis, au-delà de 24 h, la date absolue', () => {
    expect(syncAgo(minutesAgo(180), NOW, 'fr')).toEqual({ kind: 'ago', text: expect.stringMatching(/3\s*h/) })
    expect(syncAgo(minutesAgo(60 * 30), NOW, 'fr')?.kind).toBe('date')
  })
})

describe('syncIn', () => {
  it('« dans 9 min »', () => {
    expect(syncIn(minutesAhead(9), NOW, 'fr')).toEqual({ kind: 'in', text: expect.stringMatching(/9\s*min/) })
  })
  it('échue ou dans la minute : imminente, jamais un délai négatif', () => {
    expect(syncIn(minutesAhead(-5), NOW, 'fr')).toEqual({ kind: 'soon' })
    expect(syncIn(minutesAhead(0.5), NOW, 'fr')).toEqual({ kind: 'soon' })
  })
})
