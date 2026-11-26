import { describe, expect, it } from 'vitest'
import { readDossierBornFrom, readDossierZoneWidening } from './dossierZoneWidening'

describe('readDossierZoneWidening — #4432.9', () => {
  it('lit la mention posée par l’IA', () => {
    expect(readDossierZoneWidening({ dossierZoneWidening: { requested: ['Occitanie'], tier: 'france' } })).toEqual({
      requested: ['Occitanie'],
      tier: 'france',
    })
    expect(
      readDossierZoneWidening({ dossierZoneWidening: { requested: ['Gers'], tier: 'region', area: 'Occitanie' } }),
    ).toEqual({ requested: ['Gers'], tier: 'region', area: 'Occitanie' })
  })
  it('rend null sans mention, palier inconnu ou zone vide — jamais une mention devinée', () => {
    expect(readDossierZoneWidening(null)).toBeNull()
    expect(readDossierZoneWidening({})).toBeNull()
    expect(readDossierZoneWidening({ dossierZoneWidening: { requested: ['X'], tier: 'city' } })).toBeNull()
    expect(readDossierZoneWidening({ dossierZoneWidening: { requested: [], tier: 'france' } })).toBeNull()
  })
})

describe('readDossierBornFrom — #4432.10', () => {
  it('lit les critères et la zone posés par l’IA', () => {
    expect(
      readDossierBornFrom({
        dossierBornFrom: { criteria: ['Secteur : aéronautique', ' '], areas: ['Occitanie', 'Gers'] },
      }),
    ).toEqual(['Secteur : aéronautique', 'Occitanie, Gers'])
  })
  it('rend null sans critère ni zone — jamais une ligne devinée', () => {
    expect(readDossierBornFrom(null)).toBeNull()
    expect(readDossierBornFrom({ dossierBornFrom: { criteria: [], areas: [] } })).toBeNull()
  })
})
