import { contactPlaceOf } from './contact-place'

// #4044 — « des contacts non français pour une boîte dont j'ai mis le périmètre en France » : l'écran
// Opportunités juge le lieu d'un contact avec le MÊME test que l'écartement à l'analyse, et pour cela
// il lui faut le pays / la ville / l'employeur que `raw_data` porte (non servi par la liste HTTP).
describe('contactPlaceOf', () => {
  it('lit pays, ville et employeur du blob de collecte', () => {
    expect(contactPlaceOf({ country: 'Spain', city: 'Madrid', apolloDetails: { organization: 'Alcampo' } })).toEqual({
      country: 'Spain',
      city: 'Madrid',
      organization: 'Alcampo',
    })
  })

  it('une clé absente ou non textuelle reste null — jamais un lieu deviné', () => {
    expect(contactPlaceOf({ country: 42, apolloDetails: 'x' })).toBeNull()
    expect(contactPlaceOf({ city: 'Lyon', country: '  ' })).toEqual({ country: null, city: 'Lyon', organization: null })
  })

  it('aucun blob, ou aucun lieu lisible → null (rien à servir)', () => {
    expect(contactPlaceOf(null)).toBeNull()
    expect(contactPlaceOf({})).toBeNull()
  })
})
