import { describe, expect, it } from 'vitest'
import { contactCoordinates } from './contact-coordinates.js'

describe('contactCoordinates — #3698.7 : liste, fiche et préparation lisent la même vérité', () => {
  it('un e-mail seul reste un état à part entière : ni échec, ni téléphone supposé', () => {
    expect(contactCoordinates({ email: 'a@b.fr', phone: null })).toEqual({
      has_email: true,
      has_phone: false,
      state: 'email_only',
      can_prepare_email: true,
    })
  })

  it('les quatre états', () => {
    expect(contactCoordinates({ email: 'a@b.fr', phone: '+33 6 00' }).state).toBe('complete')
    expect(contactCoordinates({ email: null, phone: '+33 6 00' }).state).toBe('phone_only')
    expect(contactCoordinates({ email: null, phone: null }).state).toBe('none')
  })

  it('une chaîne blanche est une absence, partout (jamais « présent » à un endroit et « vide » à un autre)', () => {
    const c = contactCoordinates({ email: '   ', phone: ' ' })
    expect(c.state).toBe('none')
    expect(c.can_prepare_email).toBe(false)
  })

  it('un téléphone seul ne permet pas de préparer un e-mail', () => {
    expect(contactCoordinates({ email: undefined, phone: '+33 6 00' }).can_prepare_email).toBe(false)
  })
})
