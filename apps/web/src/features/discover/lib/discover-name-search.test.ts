import { describe, expect, it } from 'vitest'
import { emptyUnifiedFilters } from './discover-filters'
import { keptCriteriaLabels, withoutKeptCriteria } from './discover-name-search'

describe('lot T 2c — « Decathlon » après une recherche Java en Hauts-de-France', () => {
  const previous = { ...emptyUnifiedFilters(), keywords: 'Java', technologiesObserved: 'Java', region: ['32'] }

  it('nomme les filtres conservés, sans doublon techno/mot-clé', () => {
    expect(keptCriteriaLabels(previous)).toEqual(['Java', 'Hauts-de-France'])
  })

  it('aucun filtre posé ⇒ rien à dire (jamais une ligne vide)', () => {
    expect(keptCriteriaLabels(emptyUnifiedFilters())).toEqual([])
  })

  it('« tout effacer » vide ces critères et garde le nom tapé', () => {
    const cleared = withoutKeptCriteria({ ...previous, freetext: 'Decathlon' })
    expect(keptCriteriaLabels(cleared)).toEqual([])
    expect(cleared.freetext).toBe('Decathlon')
  })
})
