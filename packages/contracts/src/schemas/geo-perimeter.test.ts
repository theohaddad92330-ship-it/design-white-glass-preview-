import { describe, expect, it } from 'vitest'
import { isOutsideGeoPerimeter } from './geo-perimeter.js'

const france = { geo_perimeter: 'france' } as const

// #4044 — recette prod 12/10 (DECATHLON, périmètre France) : deux contacts étrangers passaient le test
// parce que leur lieu est écrit dans la langue du pays (« Frankfurt am Main », « Decathlon España »).
describe('isOutsideGeoPerimeter — lieux écrits dans la langue du pays (#4044)', () => {
  it.each([
    { location: 'Frankfurt am Main' },
    { city: 'Frankfurt am Main' },
    { location: 'Frankfurt am Main, Hessen, Deutschland' },
    { organization: 'Decathlon España' },
    { title: 'Head of Data', organization: 'Decathlon España' },
    { location: 'Madrid' },
    { location: 'Barcelona, Cataluña' },
    { location: 'München' },
    { location: 'Milano, Lombardia, Italia' },
    { location: 'Amsterdam, Noord-Holland, Nederland' },
    { location: 'Bruxelles' },
    { location: 'Zürich' },
  ])('écarte %j d’un cadrage France', place => {
    expect(isOutsideGeoPerimeter(place, france)).toBe(true)
  })

  it.each([
    { location: 'Lille, Hauts-de-France' },
    { location: 'Vienne, Isère' },
    { location: 'Lyon' },
    { location: 'Île-de-France' },
    { country: 'France', city: 'Paris' },
    {},
  ])('garde %j (France ou lieu inconnu)', place => {
    expect(isOutsideGeoPerimeter(place, france)).toBe(false)
  })
})
