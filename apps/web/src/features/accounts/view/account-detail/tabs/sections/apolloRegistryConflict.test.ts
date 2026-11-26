import { describe, expect, it } from 'vitest'
import { apolloRegistryConflicts, displayRecordedRevenue } from './apolloRegistryConflict'

describe('apolloRegistryConflicts — Apollo contre le registre', () => {
  it('signale l’année de fondation qui contredit l’immatriculation (le cas TF1)', () => {
    const c = apolloRegistryConflicts({ foundedYear: 1987 }, { creationDate: '1982-09-17' })
    expect(c.foundedYear?.registryValue).toBe('1982')
  })

  it('ne signale rien quand les deux années concordent', () => {
    expect(apolloRegistryConflicts({ foundedYear: 1982 }, { creationDate: '1982-09-17' }).foundedYear).toBeUndefined()
  })

  it('signale un CA franchement divergent, en citant les comptes déposés', () => {
    // TF1 : Apollo 2,6 Md contre 1,2 Md déposés.
    const c = apolloRegistryConflicts(
      { annualRevenue: 2_600_000_000 },
      { financials: [{ year: 2025, revenue: 1_200_000_000 }] },
    )
    expect(c.annualRevenue?.registryValue).toContain('2025')
  })

  it('tolère un écart de périmètre de consolidation (< 20 %)', () => {
    const c = apolloRegistryConflicts(
      { annualRevenue: 1_300_000_000 },
      { financials: [{ year: 2025, revenue: 1_200_000_000 }] },
    )
    expect(c.annualRevenue).toBeUndefined()
  })

  it('retient le dépôt le plus récent, pas le premier de la liste', () => {
    const c = apolloRegistryConflicts(
      { annualRevenue: 9_000_000_000 },
      {
        financials: [
          { year: 2023, revenue: 1_000_000_000 },
          { year: 2025, revenue: 1_200_000_000 },
        ],
      },
    )
    expect(c.annualRevenue?.registryValue).toContain('2025')
  })

  it('n’invente aucun conflit quand une valeur manque', () => {
    expect(apolloRegistryConflicts({}, { creationDate: '1982-09-17' })).toEqual({})
    expect(apolloRegistryConflicts({ foundedYear: 1987 }, {})).toEqual({})
    expect(apolloRegistryConflicts({ annualRevenue: 5 }, { financials: [] })).toEqual({})
    expect(apolloRegistryConflicts({ foundedYear: 1987 }, { creationDate: 'inconnue' })).toEqual({})
  })
})

// R25 (Servier) — le CA brut du registre (« 6068010000 ») se lit en euros compacts, le texte saisi reste tel quel.
describe('displayRecordedRevenue', () => {
  it('formate un nombre brut en euros français compacts', () => {
    expect(displayRecordedRevenue('6068010000', 'fr-FR')).toMatch(/^6,1\s?Md\s?€$/)
  })
  it('laisse un texte saisi à la main, et rend null sur le vide', () => {
    expect(displayRecordedRevenue('6,1 Md€ (2024)', 'fr-FR')).toBe('6,1 Md€ (2024)')
    expect(displayRecordedRevenue('  ', 'fr-FR')).toBeNull()
    expect(displayRecordedRevenue(null, 'fr-FR')).toBeNull()
  })
})
