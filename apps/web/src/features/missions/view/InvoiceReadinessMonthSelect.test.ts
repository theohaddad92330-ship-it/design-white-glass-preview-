import { describe, expect, it } from 'vitest'
import { lastTwelveMonths } from './InvoiceReadinessMonthSelect'

describe('lastTwelveMonths — le mois COURANT est en tête, les onze précédents suivent', () => {
  it('rend douze mois, du plus récent au plus ancien', () => {
    const months = lastTwelveMonths(new Date(Date.UTC(2026, 7, 31))) // 31 août 2026
    expect(months).toHaveLength(12)
    expect(months[0]).toBe('2026-08')
    expect(months[11]).toBe('2025-09')
  })

  it('traverse le changement d’ANNÉE sans se perdre', () => {
    const months = lastTwelveMonths(new Date(Date.UTC(2026, 0, 15))) // 15 janvier 2026
    expect(months[0]).toBe('2026-01')
    expect(months[1]).toBe('2025-12')
    expect(months[11]).toBe('2025-02')
  })

  it('reste stable un premier du mois (le piège des offsets de jours)', () => {
    const months = lastTwelveMonths(new Date(Date.UTC(2026, 2, 1))) // 1er mars 2026
    expect(months[0]).toBe('2026-03')
    expect(months[1]).toBe('2026-02')
  })
})
