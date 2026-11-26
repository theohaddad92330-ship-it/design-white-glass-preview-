import { describe, expect, it } from 'vitest'
import { emptyUnifiedFilters, type UnifiedFilters } from './discover-filters'
import { MIDDLE_MARKET_PATCH } from './discover-presets'
import { searchHistoryLabel } from './discover-search-history-label'

/**
 * #4313 — une recherche récente porte le nom de ses critères : le préréglage s'il y en a un, sinon
 * les 2-3 premiers critères posés. Vide uniquement quand AUCUN critère n'est posé.
 */
const names = {
  preset: (id: string) => (id === 'middleMarket' ? 'Middle market' : id === 'accessible' ? 'Comptes accessibles' : ''),
  headcount: (range: string) => `${range} salariés`,
  sector: (code: string) => `Secteur ${code}`,
}
const withFilters = (patch: Partial<UnifiedFilters>): UnifiedFilters => ({ ...emptyUnifiedFilters(), ...patch })

describe('searchHistoryLabel', () => {
  it('une recherche lancée depuis le préréglage Middle market porte son nom', () => {
    expect(searchHistoryLabel(withFilters(MIDDLE_MARKET_PATCH), names)).toBe('Middle market')
  })

  it('le préréglage passe en tête, les critères posés en plus le suivent', () => {
    const label = searchHistoryLabel(withFilters({ ...MIDDLE_MARKET_PATCH, city: 'Lyon' }), names)
    expect(label).toBe('Middle market · Lyon')
  })

  it('sans préréglage : ville, secteur, effectif — trois au plus', () => {
    const label = searchHistoryLabel(
      withFilters({ city: 'Lyon', sectors: ['62'], headcount: ['10-49'], department: '69' }),
      names,
    )
    expect(label).toBe('Lyon · Secteur 62 · 10-49 salariés')
  })

  it('la moitié d’un préréglage n’est pas le préréglage', () => {
    const label = searchHistoryLabel(withFilters({ headcount: ['250-4999'] }), names)
    expect(label).toBe('250-4999 salariés')
  })

  it('aucun critère posé : chaîne vide (l’écran dit alors « sans libellé »)', () => {
    expect(searchHistoryLabel(emptyUnifiedFilters(), names)).toBe('')
  })
})
