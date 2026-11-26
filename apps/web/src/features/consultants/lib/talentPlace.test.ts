import { describe, expect, it } from 'vitest'
import { talentPlaceLabel } from './talentPlace'

describe('talentPlaceLabel — #3935, une seule source pour le lieu', () => {
  it('la zone seule dit le lieu (le cas Lamis : en-tête « Île-de-France », Identité vide)', () => {
    expect(talentPlaceLabel({ location: null, zones: ['Île-de-France'] })).toBe('Île-de-France')
  })

  it('la ville du CV d’abord, puis la zone qu’elle ne dit pas déjà', () => {
    expect(talentPlaceLabel({ location: 'Paris', zones: ['Île-de-France'] })).toBe('Paris · Île-de-France')
  })

  it('ne répète jamais le même lieu sous deux écritures', () => {
    expect(talentPlaceLabel({ location: 'Lyon', zones: ['lyon', 'Lyon, France'] })).toBe('Lyon')
  })

  it('sait dire NON : rien (ou des blancs) → null, jamais une chaîne vide', () => {
    expect(talentPlaceLabel({})).toBeNull()
    expect(talentPlaceLabel({ location: '  ', zones: ['', ' '] })).toBeNull()
  })
})
