import { describe, expect, it } from 'vitest'
import { readReferenceDossier, REFERENCE_DOSSIER_KEY } from './reference-dossier.js'

const EMPTY = {
  counts: { units: 0, historical_needs: 0, tjm_observations: 0, contacts: 0 },
  programmes: [],
  purchasing: [],
  organisation: [],
  expertises: [],
  tjm: [],
  needs: [],
  ecosystem: [],
}

describe('reference_dossier — lecture contractuelle', () => {
  it('lit un bloc bien formé', () => {
    expect(readReferenceDossier({ [REFERENCE_DOSSIER_KEY]: EMPTY })).toEqual(EMPTY)
  })

  it('un compte ordinaire n’a pas de dossier de référence', () => {
    expect(readReferenceDossier({})).toBeNull()
    expect(readReferenceDossier(null)).toBeNull()
  })

  it('un bloc mal formé se lit comme absent, jamais comme à moitié rempli', () => {
    expect(readReferenceDossier({ [REFERENCE_DOSSIER_KEY]: { ...EMPTY, counts: { units: -1 } } })).toBeNull()
    expect(readReferenceDossier({ [REFERENCE_DOSSIER_KEY]: { programmes: 'x' } })).toBeNull()
  })

  it('un circuit sans prix n’existe pas : pas de TJM à 0', () => {
    const tjm = [{ channel: 'msp', observations: 3, min: 0, max: 0 }]
    expect(readReferenceDossier({ [REFERENCE_DOSSIER_KEY]: { ...EMPTY, tjm } })).toBeNull()
  })
})
