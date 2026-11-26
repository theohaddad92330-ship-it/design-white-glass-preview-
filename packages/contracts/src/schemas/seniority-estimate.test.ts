import { describe, expect, it } from 'vitest'
import { displayedSeniority, estimateSeniorityFromYears } from './seniority-estimate.js'

describe('estimateSeniorityFromYears — #4016 L4.3, une tranche estimée, jamais un fait', () => {
  it.each([
    [0, 'junior'],
    [2, 'junior'],
    [3, 'confirme'],
    [7, 'confirme'],
    [8, 'senior'],
    [14, 'senior'],
    [15, 'expert'],
    [40, 'expert'],
  ])('%i ans → %s', (years, band) => {
    expect(estimateSeniorityFromYears(years)).toBe(band)
  })

  it('ne devine rien sans années : null, undefined, négatif, non fini', () => {
    for (const bad of [null, undefined, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(estimateSeniorityFromYears(bad)).toBeNull()
    }
  })
})

describe('displayedSeniority — la valeur saisie gagne toujours', () => {
  it('une séniorité connue reste telle quelle, jamais estimée, même si les années disent autre chose', () => {
    expect(displayedSeniority({ seniority: 'junior', years_experience: 20 })).toEqual({
      value: 'junior',
      estimated: false,
    })
  })
  it('inconnue + années : la tranche, marquée estimée', () => {
    expect(displayedSeniority({ seniority: 'inconnu', years_experience: 6 })).toEqual({
      value: 'confirme',
      estimated: true,
    })
  })
  it('inconnue + pas d’années : reste inconnue, rien d’estimé', () => {
    expect(displayedSeniority({ seniority: 'inconnu', years_experience: null })).toEqual({
      value: 'inconnu',
      estimated: false,
    })
  })
  it('accepte une séniorité hors énumération (ligne de liste) comme une absence', () => {
    expect(displayedSeniority({ seniority: '', years_experience: 10 })).toEqual({ value: 'senior', estimated: true })
  })
})
