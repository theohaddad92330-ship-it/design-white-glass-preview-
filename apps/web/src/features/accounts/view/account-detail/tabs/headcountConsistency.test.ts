import { describe, expect, it } from 'vitest'
import { headcountContradictsHeader } from './headcountConsistency'

describe('headcountContradictsHeader (#3504)', () => {
  const proof = (n: number) => `effectif ${n} salariés — la maturité achat croît par paliers`

  it('« effectif 53 » contredit « Plus de 10 000 salariés »', () => {
    expect(headcountContradictsHeader(proof(53), 'Plus de 10 000 salariés')).toBe(true)
  })
  it('la borne haute d’une tranche ouverte ne contredit pas l’en-tête', () => {
    expect(headcountContradictsHeader(proof(20000), 'Plus de 10 000 salariés')).toBe(false)
    expect(headcountContradictsHeader(proof(1999), '1 000 à 1 999 salariés')).toBe(false)
  })
  it('une tranche fermée refuse un effectif au-dessus de sa borne', () => {
    expect(headcountContradictsHeader(proof(5000), '1 000 à 1 999 salariés')).toBe(true)
  })
  it('sait dire NON : rien de lisible, rien de jugé', () => {
    expect(headcountContradictsHeader('effectif inconnu au registre', 'Plus de 10 000 salariés')).toBe(false)
    expect(headcountContradictsHeader(proof(53), null)).toBe(false)
    expect(headcountContradictsHeader(proof(53), 'Grand groupe')).toBe(false)
  })
})
