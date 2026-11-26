import { describe, expect, it } from 'vitest'
import { contactPlaceLabel } from './contactPlace'

// LUDOVIC-E LC.1 — la zone du profil n'était pas vérifiable : aucun contact n'affichait où il travaille.
describe('contactPlaceLabel', () => {
  it('lit la localisation, à défaut la ville et le pays lus à la collecte', () => {
    expect(contactPlaceLabel({ location: 'Lyon, Auvergne-Rhône-Alpes' })).toBe('Lyon, Auvergne-Rhône-Alpes')
    expect(contactPlaceLabel({ place: { city: 'Lyon', country: 'France', organization: null } })).toBe('Lyon, France')
    expect(contactPlaceLabel({ place: { city: null, country: 'Germany', organization: null } })).toBe('Germany')
  })
  it('dit NON à ce qu’on n’a pas : rien, jamais un tiret ni un lieu deviné', () => {
    expect(contactPlaceLabel({})).toBeNull()
    expect(contactPlaceLabel({ location: '  ', place: { city: ' ', country: null, organization: 'STILL' } })).toBeNull()
  })
  it('ne répète pas une ville déjà dans la localisation', () => {
    expect(
      contactPlaceLabel({ location: 'Lyon', place: { city: 'Lyon', country: 'France', organization: null } }),
    ).toBe('Lyon')
  })
})
