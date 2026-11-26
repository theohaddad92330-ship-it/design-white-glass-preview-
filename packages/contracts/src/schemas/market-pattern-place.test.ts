import { describe, expect, it } from 'vitest'
import { FRENCH_CITY_DEPARTMENTS, FRENCH_REGION_DEPARTMENTS, FRENCH_REGIONS, placeZoneOf } from './market-pattern.js'

/** #4982.3b — la région se lit aussi dans le LIEU ÉCRIT (nom de région, grande ville nommée), sans rien deviner. */
describe('#4982.3b — placeZoneOf : la région du lieu écrit', () => {
  it('lit le NOM d’une région, sans accents ni casse ni tirets, sans département', () => {
    expect(placeZoneOf({ location: 'Paris, Île-de-France, France' })?.region).toBe('ile_de_france')
    expect(placeZoneOf({ location: 'AUVERGNE RHONE ALPES' })).toEqual({
      region: 'auvergne_rhone_alpes',
      department: null,
    })
    expect(placeZoneOf({ location: 'Provence-Alpes-Côte d’Azur, France' })?.region).toBe('provence_alpes_cote_d_azur')
    expect(placeZoneOf({ location: 'Brittany, France' })?.region).toBe('bretagne')
  })

  it('une grande ville NOMMÉE comme ville donne département et région', () => {
    expect(placeZoneOf({ city: 'Lyon' })).toEqual({ region: 'auvergne_rhone_alpes', department: '69' })
    expect(placeZoneOf({ location: 'Sophia Antipolis, France' })).toEqual({
      region: 'provence_alpes_cote_d_azur',
      department: '06',
    })
  })

  it('le code postal garde la priorité', () => {
    expect(placeZoneOf({ location: '59000 Lille' })).toEqual({ region: 'hauts_de_france', department: '59' })
    expect(placeZoneOf({ location: 'Lyon 13001' })).toEqual({
      region: 'provence_alpes_cote_d_azur',
      department: '13',
    })
  })

  it('refuse : autre pays nommé, sous-chaîne, lieu vide', () => {
    expect(placeZoneOf({ location: 'Paris, Texas, United States' })).toBeNull()
    expect(placeZoneOf({ city: 'Paris', country: 'Canada' })).toBeNull()
    expect(placeZoneOf({ location: 'Lyonnais' })).toBeNull()
    expect(placeZoneOf({ location: 'Nicest' })).toBeNull()
    expect(placeZoneOf({ location: '' })).toBeNull()
    expect(placeZoneOf({})).toBeNull()
  })

  it('le référentiel ville→département ne pointe que des départements connus', () => {
    const known = new Set(Object.values(FRENCH_REGION_DEPARTMENTS).flat())
    for (const department of Object.values(FRENCH_CITY_DEPARTMENTS)) expect(known.has(department)).toBe(true)
    expect(Object.keys(FRENCH_CITY_DEPARTMENTS)).toHaveLength(41)
    expect(FRENCH_REGIONS).toHaveLength(13)
  })
})
