import { providerPhoneNature } from './contact-phone-nature'

describe('providerPhoneNature — #4178.1', () => {
  it('un mobile n’est pas déclaré pro, quel que soit son préfixe', () => {
    expect(providerPhoneNature('+33611223344', [{ number: '+33 6 11 22 33 44', type: 'mobile' }])).toBe('unknown')
  })
  it('une ligne que le fournisseur type « travail » est déclarée pro, pas vérifiée', () => {
    expect(providerPhoneNature('+33144556677', [{ number: '+33144556677', type: 'work_hq' }])).toBe(
      'professional_declared',
    )
  })
  it('un domicile est personnel', () => {
    expect(providerPhoneNature('+33144556677', [{ number: '+33144556677', type: 'home' }])).toBe('personal')
  })
  it('sans métadonnée ou sans entrée correspondante : inconnue', () => {
    expect(providerPhoneNature('+33144556677', undefined)).toBe('unknown')
    expect(providerPhoneNature('+33144556677', [{ number: '+33999999999', type: 'work_hq' }])).toBe('unknown')
  })
  it('deux entrées contradictoires pour le même numéro : inconnue (la contradiction n’est jamais tranchée)', () => {
    expect(
      providerPhoneNature('+33144556677', [
        { number: '+33144556677', type: 'work_hq' },
        { number: '+33 1 44 55 66 77', type: 'home' },
      ]),
    ).toBe('unknown')
  })
})
