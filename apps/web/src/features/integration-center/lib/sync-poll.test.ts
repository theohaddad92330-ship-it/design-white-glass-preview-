import { describe, expect, it } from 'vitest'
import { SYNC_POLL_FLOOR_MS, nextPollDelayMs, waitingMinutes } from './sync-poll'

describe('nextPollDelayMs — le recul du sondage d’un run (#4591)', () => {
  it('ne descend jamais sous le plancher de 5 s, quel que soit le rang', () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      expect(nextPollDelayMs(attempt)).toBeGreaterThanOrEqual(5_000)
    }
    expect(SYNC_POLL_FLOOR_MS).toBe(5_000)
  })

  it('recule de façon exponentielle : 5 s, 10 s, 20 s…', () => {
    expect([0, 1, 2].map(nextPollDelayMs)).toEqual([5_000, 10_000, 20_000])
  })

  it('plafonne (un run lent reste regardé) et accepte un rang absurde sans déborder', () => {
    expect(nextPollDelayMs(50)).toBe(30_000)
    expect(nextPollDelayMs(-3)).toBe(5_000)
    expect(nextPollDelayMs(Number.NaN)).toBe(5_000)
  })
})

describe('waitingMinutes — « en attente depuis N min » (#4591)', () => {
  const start = '2026-10-26T10:00:00.000Z'
  it('rend les minutes entières écoulées depuis le départ du run', () => {
    expect(waitingMinutes(start, new Date('2026-10-26T10:03:40.000Z'))).toBe(3)
  })
  it('rend null sous la minute : on ne dit pas « 0 min » (une valeur absente n’est pas zéro)', () => {
    expect(waitingMinutes(start, new Date('2026-10-26T10:00:40.000Z'))).toBeNull()
  })
  it('rend null sur une date illisible ou future, jamais une durée inventée', () => {
    expect(waitingMinutes('pas une date', new Date('2026-10-26T10:05:00.000Z'))).toBeNull()
    expect(waitingMinutes(start, new Date('2026-10-26T09:00:00.000Z'))).toBeNull()
  })
})
