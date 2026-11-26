import { sharedWithReference } from './similar-scoring'

type Candidate = Parameters<typeof sharedWithReference>[1]

/**
 * #2127.26 / .27 — LA TAILLE ET LE TERRITOIRE, PARTAGÉS AVEC LE COMPTE OUVERT.
 *
 * La carte « comptes du même secteur » du dossier ne disait jamais POURQUOI un
 * candidat ressemble au compte ouvert au-delà du secteur. Cette fonction dit ce
 * que les deux PARTAGENT — et seulement ce qui se vérifie des DEUX côtés : une
 * donnée absente ne produit jamais « zone différente » ni « autre taille ».
 */
describe('sharedWithReference (#2127.26 / .27)', () => {
  const candidate = (over: Partial<Candidate> = {}): Candidate => ({
    city: 'BOULOGNE-BILLANCOURT',
    postal_code: '92100',
    employees_min: 250,
    employees_max: 499,
    ...over,
  })

  it('#2127.27 — même département par le code postal du siège', () => {
    expect(
      sharedWithReference({ headquarters: '15 rue X, 92500 Rueil-Malmaison', employees: null }, candidate()),
    ).toEqual(['geo'])
  })

  it('#2127.27 — même ville quand le siège ne porte pas de code postal', () => {
    expect(
      sharedWithReference({ headquarters: 'Boulogne-Billancourt', employees: null }, candidate({ postal_code: null })),
    ).toEqual(['geo'])
  })

  it('#2127.26 — tranches d’effectif qui se recoupent, séparateurs de milliers compris', () => {
    expect(sharedWithReference({ headquarters: null, employees: '300' }, candidate())).toEqual(['size'])
    expect(
      sharedWithReference(
        { headquarters: null, employees: '5 000 - 9 999' },
        candidate({ employees_min: 5000, employees_max: 9999 }),
      ),
    ).toEqual(['size'])
  })

  it('les deux à la fois, dans l’ordre du contrat', () => {
    expect(sharedWithReference({ headquarters: '92100 Boulogne', employees: '250-499' }, candidate())).toEqual([
      'geo',
      'size',
    ])
  })

  it('ne dit RIEN quand un côté manque — jamais une différence affirmée', () => {
    expect(sharedWithReference({ headquarters: null, employees: null }, candidate())).toEqual([])
    expect(
      sharedWithReference(
        { headquarters: '92100 Boulogne', employees: '300' },
        { city: '', postal_code: null, employees_min: null, employees_max: null },
      ),
    ).toEqual([])
  })

  it('ne rapproche pas deux zones ni deux tailles qui ne se recoupent pas', () => {
    expect(sharedWithReference({ headquarters: '69002 Lyon', employees: '20-49' }, candidate())).toEqual([])
  })

  it('une ville trop courte ne rapproche rien — « Eu » n’est pas contenu dans tout', () => {
    expect(
      sharedWithReference(
        { headquarters: 'Rue de Eu, Paris', employees: null },
        candidate({ city: 'EU', postal_code: null }),
      ),
    ).toEqual([])
  })
})
