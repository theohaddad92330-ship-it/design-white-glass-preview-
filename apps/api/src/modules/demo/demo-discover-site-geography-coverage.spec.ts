import { DEMO_DISCOVER_SITE_GEOGRAPHY_COVERAGE } from './demo-coverage'
import { demoDiscoverResponse } from './demo-scripts'

/**
 * #3983.4 (#3705.3) — siège / implantation de Découvrir, en démonstration (craft rule n°9). La salle
 * rend, quand une ZONE est demandée, le même bloc `geography` que le vrai chemin : Naval Group (siège à
 * Paris) a deux implantations en Pays de la Loire et en Bretagne ; une zone sans lui ne le montre pas.
 */
type RawGeography = {
  basis: 'headquarters' | 'establishment'
  headquarters: { city: string | null; department: string | null }
  siteCount: number
  zoneRegion: string | null
  sites: { siret: string | null; city: string | null; department: string | null; region: string | null }[]
}
type RawCandidate = { name: string; department: string; geography?: RawGeography }

const rows = (query: Record<string, unknown>): RawCandidate[] =>
  (demoDiscoverResponse({ includeOutOfTarget: true, ...query }) as { candidates: RawCandidate[] }).candidates
const naval = (query: Record<string, unknown>): RawCandidate | undefined =>
  rows(query).find(row => row.name.startsWith('Naval Group'))

describe('#3983.4 — siège / implantation de Découvrir, en démonstration', () => {
  it('est classé seedé, avec sa raison', () => {
    expect(DEMO_DISCOVER_SITE_GEOGRAPHY_COVERAGE.state).toBe('seede')
    expect(DEMO_DISCOVER_SITE_GEOGRAPHY_COVERAGE.reason).toContain('#3983')
  })

  it('sans zone demandée, aucun bloc géographique (chemin inchangé)', () => {
    expect(rows({}).every(row => row.geography === undefined)).toBe(true)
  })

  it('une zone qui ne tient que par des implantations rend le compte, base « implantation »', () => {
    const row = naval({ departments: ['44'] })
    expect(row?.geography).toMatchObject({
      basis: 'establishment',
      headquarters: { city: 'Paris', department: '75' },
      siteCount: 1,
    })
    expect(row?.geography?.sites.map(site => site.city)).toEqual(['La Montagne'])
  })

  it('« siège dans la zone » écarte le compte dont seule une implantation est dans la zone', () => {
    expect(naval({ departments: ['44'], siteBasis: 'headquarters' })).toBeUndefined()
  })

  it('un compte dont le siège est dans la zone le dit, sans autre établissement', () => {
    const row = naval({ departments: ['75'] })
    expect(row?.geography).toMatchObject({ basis: 'headquarters', siteCount: 0 })
  })

  it('aucun SIRET ni effectif local inventé', () => {
    const sites = rows({ departments: ['44', '56'] }).flatMap(row => row.geography?.sites ?? [])
    expect(sites.length).toBeGreaterThan(0)
    expect(sites.every(site => site.siret === null)).toBe(true)
    expect(JSON.stringify(rows({ departments: ['44', '56'] }))).not.toMatch(/localHeadcount|teamSize/)
  })
  // #3983.8 — la salle honore aussi une zone RÉGION (codes INSEE), pas seulement un département.
  it('une région qui ne tient que par une implantation rend le compte, base « implantation »', () => {
    const row = naval({ regions: ['52'] })
    expect(row?.geography).toMatchObject({ basis: 'establishment', siteCount: 1, zoneRegion: '52' })
    expect(row?.geography?.sites.map(site => [site.city, site.region])).toEqual([['La Montagne', 'Pays de la Loire']])
  })

  it('la région du siège le dit « siège », sans autre établissement', () => {
    const row = naval({ regions: ['11'] })
    expect(row?.geography).toMatchObject({ basis: 'headquarters', siteCount: 0, zoneRegion: '11' })
  })

  it('« siège dans la zone » retire le compte dont seule une implantation est dans la région', () => {
    expect(naval({ regions: ['53'], siteBasis: 'headquarters' })).toBeUndefined()
    expect(naval({ regions: ['53'] })?.geography?.sites.map(site => site.city)).toEqual(['Lorient'])
  })

  it('une région sans lui ne le montre pas ; une région seule ne nomme pas zoneRegion avec un département', () => {
    expect(naval({ regions: ['93'] })).toBeUndefined()
    expect(naval({ regions: ['52'], departments: ['44'] })?.geography?.zoneRegion).toBeNull()
  })
})
