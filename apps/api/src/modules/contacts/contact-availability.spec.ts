import { seedCoordinateAvailability, mergeSeedAvailability, availabilityPatchAfterSearch } from './contact-availability'

describe('R22 a4 — la disponibilité annoncée par la recherche gratuite', () => {
  it('sans bloc source : rien n’est annoncé (NULL, jamais devinée)', () => {
    expect(seedCoordinateAvailability({})).toEqual({ email_availability: null, phone_availability: null })
  })

  it('drapeau vrai → available ; faux → unknown', () => {
    expect(seedCoordinateAvailability({ apolloDetails: { hasEmail: true, hasPhone: false } })).toEqual({
      email_availability: 'available',
      phone_availability: 'unknown',
    })
  })

  it('une fusion monte unknown/NULL en available, ne dégrade jamais', () => {
    expect(
      mergeSeedAvailability(
        { email_availability: null, phone_availability: 'not_found' },
        { email_availability: 'available', phone_availability: 'available' },
      ),
    ).toEqual({ email_availability: 'available' })
  })

  it('après une recherche, seul le champ visé change, et seulement sur un verdict', () => {
    const coords = { phone: { state: 'not_found' as const, sources_queried: 2, at: 't' } }
    expect(
      availabilityPatchAfterSearch({ email_availability: 'available', phone_availability: 'available' }, coords),
    ).toEqual({
      phone_availability: 'not_found',
    })
    expect(
      availabilityPatchAfterSearch(
        { email_availability: 'available', phone_availability: null },
        { email: { state: 'unknown', sources_queried: 0, at: 't' } },
      ),
    ).toEqual({})
  })
})
