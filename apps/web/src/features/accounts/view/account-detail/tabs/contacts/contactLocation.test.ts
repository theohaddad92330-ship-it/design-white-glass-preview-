import { describe, expect, it } from 'vitest'
import { buildPlaceIndex, buildPlaceOptions, matchesPlace, readContactPlace } from './contactLocation'

const NO_SITES = buildPlaceIndex(undefined)

describe('readContactPlace — lieu lisible d’un contact (#3742, Arquus × Bourgogne)', () => {
  it('lit ville + pays d’un « Ville, Pays »', () => {
    expect(readContactPlace({ location: 'Trifouillis, France' }, NO_SITES)).toEqual({
      city: 'Trifouillis',
      department: null,
      region: null,
      country: 'France',
    })
  })

  // #3709 — recette Ludovic 07/10 : le filtre ne proposait que pays/villes.
  it('#3709 — une grande ville sans code postal prête département et région', () => {
    const dijon = readContactPlace({ location: 'Dijon, France' }, NO_SITES)
    expect(dijon.department).toEqual({ code: '21', name: "Côte-d'Or" })
    expect(dijon.region).toBe('Bourgogne-Franche-Comté')
    const paris = readContactPlace({ location: 'Paris' }, NO_SITES)
    expect(paris.region).toBe('Île-de-France')
    expect(paris.country).toBe('France')
    const versailles = readContactPlace({ location: 'Versailles, France' }, NO_SITES)
    expect(versailles.department?.code).toBe('78')
  })

  it('#3709 — une ville homonyme dans un autre pays ne reçoit aucun département français', () => {
    const place = readContactPlace({ location: 'Paris, United States' }, NO_SITES)
    expect(place.department).toBeNull()
    expect(place.region).toBeNull()
  })

  it('#3709 — les options proposent les régions dérivées, sans compter les contacts sans lieu', () => {
    const places = [
      readContactPlace({ location: 'Dijon, France' }, NO_SITES),
      readContactPlace({ location: 'Paris' }, NO_SITES),
      readContactPlace({ location: null }, NO_SITES),
    ]
    const regions = buildPlaceOptions(places).filter(o => o.kind === 'region')
    expect(regions.map(o => o.label).sort()).toEqual(['Bourgogne-Franche-Comté', 'Île-de-France'])
    expect(regions.every(o => o.count === 1)).toBe(true)
  })

  it('un code postal donne département ET région', () => {
    const place = readContactPlace({ location: '58180 Garchizy, France' }, NO_SITES)
    expect(place.city).toBe('Garchizy')
    expect(place.department).toEqual({ code: '58', name: 'Nièvre' })
    expect(place.region).toBe('Bourgogne-Franche-Comté')
  })

  it('une région écrite (même ancienne) est reconnue, jamais prise pour une ville', () => {
    const place = readContactPlace({ location: 'Nevers, Bourgogne, France' }, NO_SITES)
    expect(place.city).toBe('Nevers')
    expect(place.region).toBe('Bourgogne-Franche-Comté')
  })

  it('la ville d’un SITE du compte prête son département et sa région', () => {
    const index = buildPlaceIndex([{ city: 'Garchizy', postal_code: '58180' }])
    const place = readContactPlace({ location: 'Garchizy, France' }, index)
    expect(place.department).toEqual({ code: '58', name: 'Nièvre' })
    expect(place.region).toBe('Bourgogne-Franche-Comté')
  })

  it('sans lieu : rien, jamais deviné', () => {
    expect(readContactPlace({ location: null }, NO_SITES)).toEqual({
      city: null,
      department: null,
      region: null,
      country: null,
    })
  })
})

describe('buildPlaceOptions / matchesPlace', () => {
  const contacts = [
    { location: '58180 Garchizy, France' },
    { location: 'Dijon, Bourgogne-Franche-Comté, France' },
    { location: 'Madrid, Spain' },
    { location: null },
  ]
  const places = contacts.map(c => readContactPlace(c, NO_SITES))

  it('propose seulement les lieux présents, avec leur nombre — une absence ne fait aucune ligne', () => {
    const options = buildPlaceOptions(places)
    expect(options).toContainEqual({
      value: 'region:Bourgogne-Franche-Comté',
      kind: 'region',
      label: 'Bourgogne-Franche-Comté',
      count: 2,
    })
    expect(options).toContainEqual({ value: 'department:58', kind: 'department', label: 'Nièvre (58)', count: 1 })
    expect(options).toContainEqual({ value: 'country:Spain', kind: 'country', label: 'Spain', count: 1 })
    expect(options).toContainEqual({ value: 'city:garchizy', kind: 'city', label: 'Garchizy', count: 1 })
    expect(options.every(option => option.count > 0)).toBe(true)
  })

  it('filtre par région, département, ville, pays ; `all` laisse tout passer', () => {
    expect(places.filter(p => matchesPlace(p, 'region:Bourgogne-Franche-Comté'))).toHaveLength(2)
    expect(places.filter(p => matchesPlace(p, 'department:58'))).toHaveLength(1)
    expect(places.filter(p => matchesPlace(p, 'city:dijon'))).toHaveLength(1)
    expect(places.filter(p => matchesPlace(p, 'country:France'))).toHaveLength(2)
    expect(places.filter(p => matchesPlace(p, 'all'))).toHaveLength(4)
  })
})
