import { isSmsCountryAllowed, parseSmsAllowedCountryCodes, smsRecipientRefusal } from './sms-recipient'

// #4016 L12 — les pays autorisés se LISENT de `SMS_ALLOWED_COUNTRY_CODES`
// (Louis 11/10 : FR, BE, CH, LU = 33, 32, 41, 352) ; le défaut reste la France.
describe('parseSmsAllowedCountryCodes', () => {
  it('sans valeur : la France seule — sans clé, rien ne s’élargit', () => {
    expect(parseSmsAllowedCountryCodes(undefined)).toEqual(['33'])
    expect(parseSmsAllowedCountryCodes('   ')).toEqual(['33'])
  })

  it('lit la liste posée par l’opérateur, espaces et « + » tolérés', () => {
    expect(parseSmsAllowedCountryCodes('33, 32,+41 ,352')).toEqual(['33', '32', '41', '352'])
  })

  it('écarte ce qui n’est pas un indicatif (1 à 3 chiffres) — un « 3 » vaudrait la moitié du monde', () => {
    expect(parseSmsAllowedCountryCodes('33,abc,3333,,0')).toEqual(['33'])
  })

  it('une liste faite que d’entrées invalides retombe sur la France, jamais sur « tout »', () => {
    expect(parseSmsAllowedCountryCodes('abc,9999')).toEqual(['33'])
  })
})

describe('isSmsCountryAllowed', () => {
  const codes = ['33', '32', '41', '352']

  it.each(['+33612345678', '+32475123456', '+41791234567', '+352621123456'])('%s est autorisé', phone => {
    expect(isSmsCountryAllowed(phone, codes)).toBe(true)
  })

  it.each(['+14155552671', '+442071838750', '+3912345678', '0612345678', '', 'abc'])('%s est refusé', phone => {
    expect(isSmsCountryAllowed(phone, codes)).toBe(false)
  })

  it('exige le « + » du format international : un numéro national n’a pas de pays', () => {
    expect(isSmsCountryAllowed('33612345678', codes)).toBe(false)
  })
})

describe('smsRecipientRefusal — consentement et pays vérifiés à CHAQUE envoi', () => {
  const NOW = new Date('2026-10-11T08:00:00Z')
  const ok = {
    phone: '+33612345678',
    verifiedAt: new Date('2026-09-01'),
    consentAt: new Date('2026-09-01'),
    countryAllowed: true,
  }

  it('rend null quand tout est là', () => {
    expect(smsRecipientRefusal(ok, NOW)).toBeNull()
  })

  it('refuse sans numéro, sans vérification, sans consentement daté (ou à venir), hors pays', () => {
    expect(smsRecipientRefusal({ ...ok, phone: '' }, NOW)).toBe('no_number')
    expect(smsRecipientRefusal({ ...ok, verifiedAt: null }, NOW)).toBe('not_verified')
    expect(smsRecipientRefusal({ ...ok, consentAt: null }, NOW)).toBe('no_consent')
    expect(smsRecipientRefusal({ ...ok, consentAt: new Date('2026-12-01') }, NOW)).toBe('no_consent')
    expect(smsRecipientRefusal({ ...ok, countryAllowed: false }, NOW)).toBe('country_not_allowed')
  })
})
