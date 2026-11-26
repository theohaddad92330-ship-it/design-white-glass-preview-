import { describe, expect, it } from 'vitest'
import { discoverOriginCriteriaSchema } from './discover-origin.js'
import { geoScopeFromOriginCriteria, widenGeoScopeToFrance } from './discover-origin-geo-scope.js'

// #4432.1 — les critères de zone de Découvrir / Laura deviennent le PÉRIMÈTRE de l'analyse.
describe('#4432.1 — la zone cherchée devient le périmètre du dossier', () => {
  it('une ou plusieurs régions → périmètre région, nommées', () => {
    expect(geoScopeFromOriginCriteria({ zone_regions: ['Nouvelle-Aquitaine', 'Occitanie'] })).toEqual({
      geo_perimeter: 'region',
      geo_areas: ['Nouvelle-Aquitaine', 'Occitanie'],
    })
  })

  it('un département → périmètre région (le même champ générique), nommé', () => {
    expect(geoScopeFromOriginCriteria({ zone_departments: ['Haute-Garonne'] })).toEqual({
      geo_perimeter: 'region',
      geo_areas: ['Haute-Garonne'],
    })
  })

  it('une ville → périmètre ville', () => {
    expect(geoScopeFromOriginCriteria({ zone_city: 'Toulouse', zone_departments: ['Haute-Garonne'] })).toEqual({
      geo_perimeter: 'city',
      geo_areas: ['Toulouse'],
    })
  })

  it('dit NON : sans critère de zone, l’analyse reste nationale (aucun périmètre posé)', () => {
    expect(geoScopeFromOriginCriteria(undefined)).toBeUndefined()
    expect(geoScopeFromOriginCriteria({ sectors: ['aeronautics'] })).toBeUndefined()
    // L'ancien texte libre « Toulouse · 31 » seul ne se devine pas en périmètre.
    expect(geoScopeFromOriginCriteria({ zone: 'Toulouse · 31' })).toBeUndefined()
  })

  it('« Élargir à la France » relance le cadrage sans re-saisie (le reste est gardé)', () => {
    expect(
      widenGeoScopeToFrance({ geo_perimeter: 'region', geo_areas: ['Occitanie'], business_families: ['Data'] }),
    ).toEqual({ geo_perimeter: 'france', business_families: ['Data'] })
  })

  it('le contrat des critères accepte la zone structurée', () => {
    expect(
      discoverOriginCriteriaSchema.safeParse({ zone: 'Occitanie', zone_regions: ['Occitanie'], zone_city: 'Toulouse' })
        .success,
    ).toBe(true)
  })
})
