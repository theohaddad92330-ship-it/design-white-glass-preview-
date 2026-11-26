import { describe, expect, it } from 'vitest'
import {
  countActiveFilters,
  emptyUnifiedFilters,
  isUnifiedRunnable,
  refinesWithoutLaunching,
  type UnifiedFilters,
} from './discover-filters'

// Recette 21/10 S.4 — le bandeau disait « 1 critère posé », le bouton « Ajoute un critère… » : deux lectures des critères.
const POSED: readonly (readonly [string, Partial<UnifiedFilters>])[] = [
  ['sectors', { sectors: ['software_tech'] }],
  ['nafCode', { nafCode: '62.01Z' }],
  ['department', { department: '69' }],
  ['region', { region: ['84'] }],
  ['revenueMin', { revenueMin: '1000000' }],
  ['companyCategory', { companyCategory: ['PME'] }],
  ['legalForm', { legalForm: '5710' }],
  ['city', { city: 'Lyon' }],
  ['headcount', { headcount: ['50-249'] }],
  ['age', { age: 'lt3' }],
  ['freetext', { freetext: 'cloud' }],
  ['excludeSectors', { excludeSectors: ['banking'] }],
  ['excludePublicEmployers', { excludePublicEmployers: true }],
  ['cdiOnly', { cdiOnly: true }],
  ['freelanceOnly', { freelanceOnly: true }],
  ['cddOnly', { cddOnly: true }],
  ['interimOnly', { interimOnly: true }],
  ['remotePolicies', { remotePolicies: ['full_remote'] }],
  ['seniorities', { seniorities: ['senior'] }],
  ['decisionLevels', { decisionLevels: ['n1' as const] }],
  ['deliveryFitFilter', { deliveryFitFilter: ['compatible'] }],
  ['technologiesObserved', { technologiesObserved: 'Java' }],
  ['externalRecourseObserved', { externalRecourseObserved: true }],
  ['groupRole', { groupRole: 'groupe' }],
  ['contractRecourseObserved', { contractRecourseObserved: true }],
  ['excludeListed', { excludeListed: true }],
  ['entityType', { entityType: 'client' }],
]

describe('S.4 — le compteur de critères et le bouton « Rechercher » lisent la même source', () => {
  it.each(POSED)('%s : compté seul ⇒ soit lançable, soit dit qu’il affine sans lancer', (_name, patch) => {
    const filters = { ...emptyUnifiedFilters(), ...patch }
    expect(countActiveFilters(filters)).toBeGreaterThan(0)
    expect(refinesWithoutLaunching(filters)).toBe(!isUnifiedRunnable(filters))
  })
  it('les croisements d’écran posés seuls (niveau de décision…) affinent sans lancer', () => {
    const filters = { ...emptyUnifiedFilters(), decisionLevels: ['n1' as const] }
    expect(refinesWithoutLaunching(filters)).toBe(true)
  })
  it('dit NON : aucun critère, ou un critère de registre ⇒ rien à signaler', () => {
    expect(refinesWithoutLaunching(emptyUnifiedFilters())).toBe(false)
    expect(refinesWithoutLaunching({ ...emptyUnifiedFilters(), region: ['84'] })).toBe(false)
  })
})
