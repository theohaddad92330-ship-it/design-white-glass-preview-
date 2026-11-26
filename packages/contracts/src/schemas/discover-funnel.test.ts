import { describe, expect, it } from 'vitest'
import { readDiscoverFunnel } from './discover-funnel.js'

describe('readDiscoverFunnel (#4419)', () => {
  it("lit entrés / retenus / écartés par critère, dans l'ordre du dépôt", () => {
    expect(readDiscoverFunnel({ funnel: { entered: 97, kept: 2, rejected: { zone: 1, city: 94 } } })).toEqual({
      entered: 97,
      kept: 2,
      rejected: [
        { criterion: 'city', count: 94 },
        { criterion: 'zone', count: 1 },
      ],
    })
  })

  it('un critère à 0 ou inconnu ne fait aucune ligne (jamais « 0 écarté »)', () => {
    const funnel = readDiscoverFunnel({ funnel: { kept: 3, rejected: { city: 0, brave: 9 } } })
    expect(funnel).toEqual({ kept: 3, rejected: [] })
  })

  it("un amont muet sur ce qu'il a vu : pas d'« entrés » inventé", () => {
    expect(readDiscoverFunnel({ funnel: { kept: 3, rejected: { city: 4 } } })).not.toHaveProperty('entered')
  })

  it('sans entonnoir, ou illisible : null', () => {
    expect(readDiscoverFunnel(undefined)).toBeNull()
    expect(readDiscoverFunnel({ funnel: 'x' })).toBeNull()
    expect(readDiscoverFunnel({ funnel: { kept: -1 } })).toBeNull()
  })
})
