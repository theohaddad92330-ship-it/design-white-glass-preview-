import { describe, expect, it } from 'vitest'
import { monthsBack } from './margin-trend'

describe('monthsBack', () => {
  it('rend N mois, du plus ancien au plus récent, en excluant le mois courant', () => {
    const now = new Date('2026-08-31T12:00:00.000Z')
    expect(monthsBack(now, 3)).toEqual(['2026-05', '2026-06', '2026-07'])
  })

  it('gère le passage d’année', () => {
    const now = new Date('2026-02-15T00:00:00.000Z')
    expect(monthsBack(now, 3)).toEqual(['2025-11', '2025-12', '2026-01'])
  })
})
