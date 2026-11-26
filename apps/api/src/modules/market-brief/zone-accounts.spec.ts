/**
 * Capacité « Marchés locaux » (L1) — quels comptes de l'espace appartiennent à une zone ?
 * Trois liens, du plus fort au plus faible : le siège, un site, le nom cité dans le brief.
 */
import { departmentFromPostalCode, linkAccountsToZone, locationInZone, type ZoneGeo } from './zone-accounts'

const nord: ZoneGeo = { scope: 'france', departments: ['59'], cantons: [], cities: ['Lille'] }
const vaud: ZoneGeo = { scope: 'suisse', departments: [], cantons: ['VD'], cities: ['Lausanne'] }

describe('departmentFromPostalCode', () => {
  it('lit les deux premiers chiffres', () => expect(departmentFromPostalCode('59000')).toBe('59'))
  it('distingue la Corse', () => {
    expect(departmentFromPostalCode('20000')).toBe('2A')
    expect(departmentFromPostalCode('20200')).toBe('2B')
  })
  it('garde trois chiffres pour les DOM', () => expect(departmentFromPostalCode('97400')).toBe('974'))
  it('ne devine rien sur un code suisse à quatre chiffres', () => expect(departmentFromPostalCode('1003')).toBeNull())
})

describe('locationInZone', () => {
  it('reconnaît le département par code postal, par « (59) » ou par ville', () => {
    expect(locationInZone('12 rue Nationale, 59800 Lille', nord)).toBe(true)
    expect(locationInZone('Roubaix (59)', nord)).toBe(true)
    expect(locationInZone('LILLE', nord)).toBe(true)
    expect(locationInZone('Paris (75)', nord)).toBe(false)
  })
  it('ne prend pas une sous-chaîne pour une ville', () => {
    expect(locationInZone('Villeneuve-d’Ascq', { ...nord, departments: [], cities: ['Ascq'] })).toBe(true)
    expect(locationInZone('Lillers', { ...nord, departments: [], cities: ['Lille'] })).toBe(false)
  })
  it('une zone suisse se lit par ville ou sigle de canton, jamais par département', () => {
    expect(locationInZone('Lausanne', vaud)).toBe(true)
    expect(locationInZone('1003 Renens VD', vaud)).toBe(true)
    expect(locationInZone('59000 Lille', vaud)).toBe(false)
  })
  it('un texte vide n’est dans aucune zone', () => {
    expect(locationInZone(null, nord)).toBe(false)
    expect(locationInZone('  ', nord)).toBe(false)
  })
})

describe('linkAccountsToZone', () => {
  const accounts = [
    { id: 'a1', name: 'ADEO', headquarters: '59650 Villeneuve-d’Ascq' },
    { id: 'a2', name: 'Orange', headquarters: 'Paris (75)' },
    { id: 'a3', name: 'Leroy Merlin SA', headquarters: null },
    { id: 'a4', name: 'Decathlon', headquarters: null },
    { id: 'a5', name: 'Thales', headquarters: 'Gennevilliers (92)' },
  ]
  const sites = [
    { account_id: 'a2', city: 'Lille', postal_code: '59000' },
    { account_id: 'a5', city: 'Toulouse', postal_code: '31000' },
  ]
  const brief = {
    clients: [{ name: 'Leroy Merlin' }],
    groups: [{ members: [{ name: 'Decathlon' }] }],
    esn: [{ name: 'Sopra Steria' }],
  }

  it('lie par le siège (code postal dans le département de la zone)', () => {
    expect(linkAccountsToZone({ zone: nord, accounts, sites, brief: null })).toContainEqual({
      account_id: 'a1',
      name: 'ADEO',
      match: 'headquarters',
    })
  })

  it('lie par un site quand le siège est ailleurs', () => {
    expect(linkAccountsToZone({ zone: nord, accounts, sites, brief: null })).toContainEqual({
      account_id: 'a2',
      name: 'Orange',
      match: 'site',
    })
  })

  it('lie par le nom normalisé cité dans le brief (clients, groupes, esn)', () => {
    const linked = linkAccountsToZone({ zone: nord, accounts, sites, brief })
    expect(linked).toContainEqual({ account_id: 'a3', name: 'Leroy Merlin SA', match: 'named_in_brief' })
    expect(linked).toContainEqual({ account_id: 'a4', name: 'Decathlon', match: 'named_in_brief' })
  })

  it('ne lie pas un compte hors zone et absent du brief', () => {
    const ids = linkAccountsToZone({ zone: nord, accounts, sites, brief }).map(l => l.account_id)
    expect(ids).not.toContain('a5')
  })

  it('un seul lien par compte, le plus fort', () => {
    const linked = linkAccountsToZone({
      zone: nord,
      accounts: [{ id: 'a1', name: 'ADEO', headquarters: 'Lille (59)' }],
      sites: [{ account_id: 'a1', city: 'Lille', postal_code: '59000' }],
      brief: { clients: [{ name: 'ADEO' }] },
    })
    expect(linked).toEqual([{ account_id: 'a1', name: 'ADEO', match: 'headquarters' }])
  })

  it('sans brief, seuls siège et sites comptent ; le nom vide ne rapproche rien', () => {
    const linked = linkAccountsToZone({
      zone: nord,
      accounts: [{ id: 'x', name: 'SA', headquarters: null }],
      sites: [],
      brief: { clients: [{ name: 'Groupe' }] },
    })
    expect(linked).toEqual([])
  })
})
