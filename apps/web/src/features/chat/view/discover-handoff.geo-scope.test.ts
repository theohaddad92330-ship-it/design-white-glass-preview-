import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { filtersFromSearch } from '../../discover/lib/discover-prefill'
import { discoverSearch } from './discover-handoff'

/**
 * #3876.5 — Laura et Découvrir, même phrase → même périmètre. Moitié écran du test
 * CROISÉ : la table `packages/contracts/src/fixtures/geo-scope-laura-discover.json` est
 * aussi lue par `apps/ia/tests/test_3876_5_geo_laura_decouvrir.py`, qui prouve que
 * `find_accounts` propose `scope`. Ici : la proposition `scope`, cliquée, ouvre
 * Découvrir sur EXACTEMENT ce périmètre — une ville reste une ville (le champ « Ville »,
 * borné à la commune), jamais son département.
 */

type Scope = { city: string; department: string; region: string[] }
type GeoCase = { phrase: string; kind: string; scope: Scope }

const FIXTURE = join(__dirname, '../../../../../../packages/contracts/src/fixtures/geo-scope-laura-discover.json')
const CASES = (JSON.parse(readFileSync(FIXTURE, 'utf8')) as { cases: GeoCase[] }).cases

function proposalFrom(scope: Scope) {
  return {
    action: 'find_accounts' as const,
    sectors: ['finance'],
    ...(scope.city ? { city: scope.city } : {}),
    ...(scope.department ? { department: scope.department } : {}),
    ...(scope.region.length ? { region: scope.region } : {}),
  }
}

describe('#3876.5 — le lien Laura → Découvrir garde la maille géographique', () => {
  it('lit la table partagée (ville, département, région)', () => {
    expect(new Set(CASES.map(c => c.kind))).toEqual(new Set(['city', 'department', 'region']))
  })

  it.each(CASES.map(c => [`${c.kind} — ${c.phrase}`, c] as const))('%s', (_label, geoCase) => {
    const filters = filtersFromSearch(discoverSearch(proposalFrom(geoCase.scope)))
    expect(filters).not.toBeNull()
    expect(filters?.city).toBe(geoCase.scope.city)
    expect(filters?.department).toBe(geoCase.scope.department)
    expect(filters?.region).toEqual(geoCase.scope.region)
  })

  it('sait dire NON — une ville proposée n’ouvre jamais Découvrir sur un département', () => {
    const search = discoverSearch({ action: 'find_accounts', city: 'Marseille' })
    expect(search.city).toBe('Marseille')
    expect(search.department).toBeUndefined()
    expect(filtersFromSearch(search)?.department).toBe('')
  })
})
