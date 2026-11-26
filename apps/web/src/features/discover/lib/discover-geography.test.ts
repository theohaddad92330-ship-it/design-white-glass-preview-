import { describe, expect, it } from 'vitest'
import { candidateGeographyLine } from './discover-geography'
import fr from '../../../i18n/locales/fr/discover.json'
import en from '../../../i18n/locales/en/discover.json'
import type { DiscoverCandidate } from './discover-types'

type Geography = NonNullable<DiscoverCandidate['geography']>

const geography = (overrides: Partial<Geography> = {}): Geography => ({
  basis: 'establishment',
  headquarters: { city: 'VERSAILLES', department: '78' },
  siteCount: 1,
  sites: [],
  zoneRegion: null,
  ...overrides,
})

describe('candidateGeographyLine (#3983.1)', () => {
  it('says the headquarters and the sites in the zone', () => {
    expect(candidateGeographyLine(geography())).toEqual({
      key: 'card.geography.headquartersAndSites',
      values: { city: 'Versailles', department: '78', count: 1 },
    })
  })

  it('says the headquarters is in the zone when no other site is listed', () => {
    expect(candidateGeographyLine(geography({ basis: 'headquarters', siteCount: 0 }))).toEqual({
      key: 'card.geography.headquartersInZone',
      values: { city: 'Versailles', department: '78' },
    })
  })

  it('never says zero: nothing proven means no line', () => {
    expect(candidateGeographyLine(undefined)).toBeNull()
    expect(candidateGeographyLine(geography({ siteCount: 0 }))).toBeNull()
  })

  it('names the headquarters without inventing a missing city', () => {
    const line = candidateGeographyLine(geography({ headquarters: { city: null, department: null } }))
    expect(line?.key).toBe('card.geography.sitesOnly')
    expect(line?.values).toEqual({ count: 1 })
  })

  it('has no team or headcount value: the source does not publish it', () => {
    const line = candidateGeographyLine(geography())
    expect(JSON.stringify(line)).not.toMatch(/headcount|team|effectif/i)
  })
})

// #3983.1 — siège à Paris, établissement dans la zone (69) : la carte dit « Implantée dans la zone »,
// jamais un décompte nu « 1 établissement dans la zone » (le filtre de base de zone dit la même chose).
describe('wording of the zone line (#3983.1)', () => {
  it('names the presence in the zone, FR and EN', () => {
    expect(fr.card.geography.headquartersAndSites_one).toContain('implantée dans la zone')
    expect(fr.card.geography.sitesOnly_one).toMatch(/^Implantée dans la zone/)
    expect(en.card.geography.headquartersAndSites_one).toContain('present in the zone')
    expect(en.card.geography.sitesOnly_one).toMatch(/^Present in the zone/)
  })

  it('a Paris headquarters with one site in the Rhône is a presence line', () => {
    const line = candidateGeographyLine(geography({ headquarters: { city: 'PARIS', department: '75' } }))
    expect(line).toEqual({
      key: 'card.geography.headquartersAndSites',
      values: { city: 'Paris', department: '75', count: 1 },
    })
  })
})
