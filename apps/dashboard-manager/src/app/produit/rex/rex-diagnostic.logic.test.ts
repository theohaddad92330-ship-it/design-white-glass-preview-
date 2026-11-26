import { describe, expect, it } from 'vitest'
import { marqueurDoublon, nomAuteur } from './rex-diagnostic.logic'

describe('#3544.4 — diagnostic des REX', () => {
  it('marqueur : « identique à N autres REX », accordé', () => {
    expect(marqueurDoublon(1)).toBe('texte identique à 1 autre REX')
    expect(marqueurDoublon(2)).toBe('texte identique à 2 autres REX')
  })

  it('SAIT DIRE NON : un REX unique ne porte aucun marqueur', () => {
    expect(marqueurDoublon(0)).toBeNull()
  })

  it('auteur : nom composé, ou null (jamais deviné)', () => {
    expect(nomAuteur({ firstName: 'Sarah', lastName: 'Roy' })).toBe('Sarah Roy')
    expect(nomAuteur({ firstName: null, lastName: null })).toBeNull()
    expect(nomAuteur(null)).toBeNull()
  })
})
