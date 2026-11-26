import { normalizeWhyContact, WHY_CONTACT_SHARED_MIN_OTHERS } from './why-contact-shared'

describe('normalizeWhyContact (#3692.7)', () => {
  it('ignore la casse, les espaces et la ponctuation finale', () => {
    expect(normalizeWhyContact('  Contact clé pour vos offres. ')).toBe('contact clé pour vos offres')
    expect(normalizeWhyContact('CONTACT clé pour vos offres')).toBe('contact clé pour vos offres')
  })

  it('une absence reste vide : jamais comparée', () => {
    expect(normalizeWhyContact(null)).toBe('')
    expect(normalizeWhyContact('   ')).toBe('')
  })

  it('deux textes distincts restent distincts', () => {
    expect(normalizeWhyContact('Pilote la refonte du SI')).not.toBe(normalizeWhyContact('Pilote la refonte du SIRH'))
  })

  it('le seuil est de deux autres contacts', () => {
    expect(WHY_CONTACT_SHARED_MIN_OTHERS).toBe(2)
  })
})
