import { describe, expect, it } from 'vitest'
import { sectorCoverageReading } from './discover-sector-coverage'

// #4358.3 — un secteur sans donnée suffisante le DIT, au lieu d'une liste maigre muette.
const withNaf = (n: number) => Array.from({ length: n }, () => ({ nafCode: '6201Z' }))
const withoutNaf = (n: number) => Array.from({ length: n }, () => ({ nafCode: null }))

describe('sectorCoverageReading', () => {
  it('peu de résultats pour un secteur cherché → « thin » avec le vrai compte', () => {
    expect(sectorCoverageReading(['Banque'], withNaf(5))).toEqual({ kind: 'thin', count: 5 })
  })

  it('NAF connu pour moins de la moitié → « naf » avec les vrais comptes', () => {
    expect(sectorCoverageReading(['Banque'], [...withNaf(3), ...withoutNaf(9)])).toEqual({
      kind: 'naf',
      known: 3,
      total: 12,
    })
  })

  it('sait dire NON : secteur bien couvert (12 entreprises, NAF connu) → rien', () => {
    expect(sectorCoverageReading(['Banque'], withNaf(12))).toBeNull()
  })

  it('sait dire NON : aucun secteur cherché → rien, quel que soit le nombre', () => {
    expect(sectorCoverageReading([], withNaf(4))).toBeNull()
    expect(sectorCoverageReading(undefined, withoutNaf(12))).toBeNull()
  })

  it('sait dire NON : zéro ou 1-2 résultats → la notice « recherche incomplète » parle déjà', () => {
    expect(sectorCoverageReading(['Banque'], [])).toBeNull()
    expect(sectorCoverageReading(['Banque'], withNaf(2))).toBeNull()
  })
})
