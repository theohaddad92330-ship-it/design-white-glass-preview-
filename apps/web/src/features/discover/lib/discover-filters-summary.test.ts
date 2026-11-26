import { describe, expect, it } from 'vitest'
import { emptyUnifiedFilters } from './discover-filters'
import { summarizeFilters } from './discover-filters-summary'

// #4301.3 — le résumé « retient / écarte » lit les MÊMES filtres que le rail, sans rien inventer.
describe('summarizeFilters (#4301.3)', () => {
  it('sait dire NON : aucun critère → aucune ligne, ni retenue ni écartée', () => {
    expect(summarizeFilters(emptyUnifiedFilters())).toEqual({ kept: [], dropped: [] })
  })

  it('range ce que la recherche retient : zones, secteurs, tailles, intermédiaires', () => {
    const { kept, dropped } = summarizeFilters({
      ...emptyUnifiedFilters(),
      region: ['11'],
      department: '69, 38',
      city: 'Lyon',
      sectors: ['software_tech'],
      headcount: ['10-49', '50-249', '1000+'],
      entityType: 'esn',
    })
    expect(kept).toEqual([
      { key: 'zones', values: ['11', '69', '38', 'Lyon'] },
      { key: 'sectors', values: ['software_tech'] },
      { key: 'size', values: ['PME', 'GC'] },
      { key: 'intermediaries', values: ['esn'] },
    ])
    expect(dropped).toEqual([])
  })

  it('range ce qu’elle écarte : secteurs exclus, cotées, employeurs publics, ESN', () => {
    const { kept, dropped } = summarizeFilters({
      ...emptyUnifiedFilters(),
      excludeSectors: ['retail_banking'],
      excludeListed: true,
      excludePublicEmployers: true,
      entityType: 'client',
    })
    expect(kept).toEqual([])
    expect(dropped.map(line => line.key)).toEqual(['excludedSectors', 'listed', 'publicEmployers', 'intermediaries'])
  })

  it('« Toute la France » et « les deux » ne retiennent ni n’écartent rien', () => {
    const { kept, dropped } = summarizeFilters({ ...emptyUnifiedFilters(), entityType: 'all' })
    expect(kept).toEqual([])
    expect(dropped).toEqual([])
  })
})
