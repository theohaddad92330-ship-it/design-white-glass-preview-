import {
  employmentCheckState,
  employmentFromHits,
  championEmploymentCheckLimit,
  MOVED_CHAMPION_TITLE,
} from './employment-check'

// #4016.L2 — « ton champion a changé de boîte » : la lecture d'un employeur courant
// auprès d'un annuaire professionnel sous contrat (jamais LinkedIn en direct).
const hit = (id: string, organizationName: string, title = 'Directeur') => ({
  id,
  firstName: 'Léa',
  lastNameObfuscated: 'Du***',
  title,
  organizationName,
  city: '',
  country: '',
  hasEmail: false,
  hasPhone: false,
})

describe('employmentFromHits', () => {
  it('ne retient que la fiche dont l’identifiant est celui du contact (jamais un homonyme)', () => {
    const seen = employmentFromHits([hit('x', 'Autre SA'), hit('p1', 'Nouvelle SA')], 'p1')
    expect(seen).toEqual({ organization: 'Nouvelle SA', title: 'Directeur' })
  })
  it('aucune fiche à cet identifiant ⇒ null : on ne devine pas', () => {
    expect(employmentFromHits([hit('x', 'Autre SA')], 'p1')).toBeNull()
    expect(employmentFromHits([], 'p1')).toBeNull()
  })
  it('une fiche sans employeur ne prouve rien', () => {
    expect(employmentFromHits([hit('p1', '  ')], 'p1')).toBeNull()
  })
})

describe('championEmploymentCheckLimit', () => {
  it('sans réglage : 0, no-op strict', () => {
    expect(championEmploymentCheckLimit(undefined)).toBe(0)
    expect(championEmploymentCheckLimit('')).toBe(0)
    expect(championEmploymentCheckLimit('abc')).toBe(0)
    expect(championEmploymentCheckLimit('-3')).toBe(0)
  })
  it('un entier positif, plafonné à 50', () => {
    expect(championEmploymentCheckLimit('10')).toBe(10)
    expect(championEmploymentCheckLimit('500')).toBe(50)
  })
})

it('le titre ne nomme aucun fournisseur', () => {
  expect(MOVED_CHAMPION_TITLE).toMatch(/champion/i)
  expect(MOVED_CHAMPION_TITLE).not.toMatch(/linkedin|apollo/i)
})

// #4055.8 (Louis 15/10/2026) — trois états d'un contact : pas encore vérifié, non retrouvé, a quitté l'entreprise.
describe('employmentCheckState (#4055.8)', () => {
  const seen = (organization: string) => ({ organization, title: 'DSI' })

  it('rien retrouvé à la relecture : « non retrouvé » (daté), jamais « a quitté »', () => {
    expect(employmentCheckState(null, 'Orange')).toBe('not_found')
  })

  it('même employeur, à la forme juridique ou à la casse près : confirmé', () => {
    expect(employmentCheckState(seen('ORANGE SA'), 'Orange')).toBe('confirmed')
    expect(employmentCheckState(seen('Société Générale'), 'Societe Generale S.A.')).toBe('confirmed')
    expect(employmentCheckState(seen('Orange Business'), 'Orange')).toBe('confirmed')
  })

  it('un autre employeur observé, daté : a quitté l’entreprise', () => {
    expect(employmentCheckState(seen('Capgemini'), 'Orange')).toBe('left')
  })

  it('SAIT DIRE NON — sans nom de compte lisible, on ne peut pas dire « a quitté » : employeur vu seulement', () => {
    expect(employmentCheckState(seen('Capgemini'), null)).toBe('seen')
    expect(employmentCheckState(seen('Capgemini'), '  ')).toBe('seen')
  })
})
