import type { AnalysisScopeSelection } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { perimeterSummaryParts } from './framing-summary'

// Théo B r1-recherche.R7 — « Périmètre · France · 2 entités ciblées, 1 exclue » : ce qui est posé, rien d’inventé.
describe('résumé du périmètre', () => {
  it('rend la zone et les comptes d’entités, au singulier comme au pluriel', () => {
    const selection: AnalysisScopeSelection = {
      geo_perimeter: 'france',
      included_entities: ['BPAURA', 'CERA'],
      excluded_entities: ['Natixis'],
    }
    expect(perimeterSummaryParts(selection)).toEqual({
      zone: 'france',
      areas: [],
      included: 2,
      excluded: 1,
    })
  })

  it('reprend les zones saisies (régions, villes) sans les mélanger à la zone', () => {
    expect(perimeterSummaryParts({ geo_perimeter: 'city', geo_areas: ['Lyon', 'Nantes'] })).toMatchObject({
      zone: 'city',
      areas: ['Lyon', 'Nantes'],
    })
  })

  it('un cadrage sans zone ni entité ne dit rien : jamais « 0 entité »', () => {
    expect(perimeterSummaryParts({})).toEqual({ zone: undefined, areas: [], included: 0, excluded: 0 })
  })
})
