import { describe, expect, it } from 'vitest'
import type { DiscoverCandidate } from './discover-types'
import { marketBreakdown } from './discover-market-breakdown'

const candidate = (sector: string | null, headcountRange: string | null): DiscoverCandidate =>
  ({ name: 'x', siren: '1', sector, headcountRange }) as unknown as DiscoverCandidate

describe('marketBreakdown — la répartition des comptes affichés', () => {
  it('range par secteur, du plus fréquent au moins fréquent, et regroupe au-delà de cinq', () => {
    const list = [
      ...Array.from({ length: 3 }, () => candidate('Banque', '1000+')),
      ...Array.from({ length: 2 }, () => candidate('Énergie', '250-999')),
      candidate('Transport', '50-249'),
      candidate('Télécoms', '10-49'),
      candidate('Santé', '1-9'),
      candidate('Commerce', '50-249'),
      candidate('Industrie', '50-249'),
    ]
    const { sectors, sectored } = marketBreakdown(list)
    expect(sectors[0]).toEqual({ sector: 'Banque', count: 3 })
    expect(sectors).toHaveLength(6)
    expect(sectors.at(-1)).toEqual({ sector: null, count: 2 })
    expect(sectored).toBe(list.length)
  })

  it('compte les tailles par bande, GC en tête, sans inventer', () => {
    const { sizes } = marketBreakdown([
      candidate('A', '1000+'),
      candidate('A', '250-999'),
      candidate('A', '50-249'),
      candidate('A', '10-49'),
    ])
    expect(sizes).toEqual([
      { code: 'GC', count: 1 },
      { code: 'ETI', count: 1 },
      { code: 'PME', count: 2 },
    ])
  })

  it('SAIT DIRE NON : secteur ou effectif inconnus ne font aucune part, jamais « 0 »', () => {
    const { sectors, sizes, sectored } = marketBreakdown([candidate(null, null), candidate('Banque', null)])
    expect(sectored).toBe(1)
    expect(sectors).toEqual([{ sector: 'Banque', count: 1 }])
    expect(sizes).toEqual([])
    expect(marketBreakdown([]).sectors).toEqual([])
  })
})
