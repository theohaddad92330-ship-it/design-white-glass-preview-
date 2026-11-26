import { describe, expect, it } from 'vitest'
import { initialCadrage, knownEntityNames } from './initialCadrage'

/**
 * Cadrage analyse (15/10, décision E) — les anciens liens `/search?scope=…` et
 * le périmètre mémorisé (#4161) se MIGRENT vers la question « Où ? », sans
 * casser un lien existant. La zone d'une relance (#3742) garde la main.
 */
describe('initialCadrage', () => {
  it('sans rien : aucune zone — l’écran pose France si le marché est la France', () => {
    expect(initialCadrage({})).toEqual({})
  })

  it('un ancien lien perimeter/scope=groupe ouvre « Monde » (il ne filtrait aucun pays)', () => {
    expect(initialCadrage({ scope: 'groupe' })).toEqual({ geo_perimeter: 'world' })
    expect(initialCadrage({ scope: 'france' })).toEqual({ geo_perimeter: 'france' })
  })

  it('le périmètre mémorisé (#4161) sert de défaut quand l’URL ne dit rien', () => {
    expect(initialCadrage({ remembered: 'it_digital' })).toEqual({ geo_perimeter: 'world' })
    expect(initialCadrage({ scope: 'france', remembered: 'groupe' })).toEqual({ geo_perimeter: 'france' })
  })

  it('la zone reprise d’une relance (#3742) gagne sur tout', () => {
    expect(initialCadrage({ scope: 'groupe', geo: 'city', geoAreas: ['Lille'] })).toEqual({
      geo_perimeter: 'city',
      geo_areas: ['Lille'],
    })
  })

  it('#4432.2 — la `zone` de l’URL (Découvrir, cartes de Laura) devient le périmètre présélectionné', () => {
    expect(initialCadrage({ zone: 'Occitanie' })).toEqual({ geo_perimeter: 'region', geo_areas: ['Occitanie'] })
    // Elle gagne sur un ancien lien ou la mémoire, jamais sur la zone d’une relance.
    expect(initialCadrage({ zone: 'Occitanie', scope: 'groupe', remembered: 'france' })).toEqual({
      geo_perimeter: 'region',
      geo_areas: ['Occitanie'],
    })
    expect(initialCadrage({ zone: 'Occitanie', geo: 'city', geoAreas: ['Lille'] })).toEqual({
      geo_perimeter: 'city',
      geo_areas: ['Lille'],
    })
  })

  it('une valeur d’URL inconnue retombe sur le défaut, jamais une erreur', () => {
    expect(initialCadrage({ scope: 'n-importe' })).toEqual({})
  })
})

describe('knownEntityNames — l’autocomplétion de « Quelle partie du groupe ? »', () => {
  it('lit les entités déjà connues du dossier relancé, dédupliquées, sans inventer', () => {
    const account = {
      subsidiaries: [{ name: 'Siemens Mobility' }, 'Siemens Energy'],
      raw_analysis: { subsidiaries: [{ name: 'Siemens Mobility' }, { entity: 'Siemens Healthineers' }] },
    }
    expect(knownEntityNames(account)).toEqual(['Siemens Mobility', 'Siemens Energy', 'Siemens Healthineers'])
  })

  it('une société jamais analysée n’a aucune entité connue — aucune liste inventée', () => {
    expect(knownEntityNames(null)).toEqual([])
    expect(knownEntityNames({ subsidiaries: [], raw_analysis: null })).toEqual([])
  })
})

// #4432.3 — « Analyser » depuis Découvrir : la zone cherchée arrive PRÉREMPLIE dans « Où ? », modifiable.
describe('initialCadrage — la zone de la recherche Découvrir', () => {
  it('Occitanie cherchée → périmètre région « Occitanie »', () => {
    expect(initialCadrage({ searched: { zone: 'Occitanie', zone_regions: ['Occitanie'] } })).toEqual({
      geo_perimeter: 'region',
      geo_areas: ['Occitanie'],
    })
  })

  it('dit NON : un périmètre explicite gagne, et sans zone cherchée rien n’est posé', () => {
    expect(initialCadrage({ geo: 'france', searched: { zone_regions: ['Occitanie'] } })).toEqual({
      geo_perimeter: 'france',
    })
    expect(initialCadrage({ searched: { sectors: ['aeronautics'] } })).toEqual({})
  })
})
