import { countNameAmbiguities } from './ambiguity-detection'

describe('#2207.31 — countNameAmbiguities', () => {
  it('compte 0 quand aucune fiche ne partage un nom, dans le même compte', () => {
    expect(
      countNameAmbiguities([
        { account_id: 'acc-1', full_name: 'Marie Dupont' },
        { account_id: 'acc-1', full_name: 'Jean Martin' },
      ]),
    ).toBe(0)
  })

  it('compte les DEUX fiches qui partagent un nom plié dans le même compte', () => {
    expect(
      countNameAmbiguities([
        { account_id: 'acc-1', full_name: 'Marie Dupont' },
        { account_id: 'acc-1', full_name: 'marie dupont' },
      ]),
    ).toBe(2)
  })

  it('plie la casse ET les accents (« Bénard » / « Benard »)', () => {
    expect(
      countNameAmbiguities([
        { account_id: 'acc-1', full_name: 'Bénard' },
        { account_id: 'acc-1', full_name: 'Benard' },
      ]),
    ).toBe(2)
  })

  it("le MÊME nom dans DEUX comptes DIFFÉRENTS n'est pas une ambiguïté — deux personnes distinctes", () => {
    expect(
      countNameAmbiguities([
        { account_id: 'acc-1', full_name: 'Marie Dupont' },
        { account_id: 'acc-2', full_name: 'Marie Dupont' },
      ]),
    ).toBe(0)
  })

  it('ignore les fiches sans compte — rien à rapprocher', () => {
    expect(
      countNameAmbiguities([
        { account_id: null, full_name: 'Marie Dupont' },
        { account_id: null, full_name: 'Marie Dupont' },
      ]),
    ).toBe(0)
  })
})
