import { describe, expect, it } from 'vitest'
import { applyStrictCriteria, wideningOf } from './discover-widening'
import type { DiscoverRequest } from '@/features/discover/hooks/useDiscoverSearch'

// #4433 — l'élargissement par paliers se DIT au-dessus de la liste ; « revenir au strict » le coupe.
describe('#4433 — élargissement par paliers, côté écran', () => {
  const registry: DiscoverRequest = { mode: 'registry', query: { filters: {}, limit: 24 } }

  it('« revenir au strict » se pose sur la recherche Registre en cours, et seulement quand le geste est fait', () => {
    expect(applyStrictCriteria(registry, false)).toBe(registry)
    expect(applyStrictCriteria(registry, true)).toEqual({
      mode: 'registry',
      query: { filters: {}, limit: 24, strictCriteria: true },
    })
    expect(applyStrictCriteria(null, true)).toBeNull()
  })

  it('lit `query.widening` validé par le contrat ; absent ou invalide = rien à dire', () => {
    const widening = {
      minResults: 10,
      exactCount: 0,
      steps: [{ axis: 'skill', tier: 1, codes: ['javascript'], added: 3 }],
    }
    expect(wideningOf({ widening })).toEqual(widening)
    expect(wideningOf({})).toBeNull()
    expect(wideningOf({ widening: { steps: 'x' } })).toBeNull()
  })
})

describe('#4433 — la normalisation garde l’étiquette d’élargissement', () => {
  it('un candidat élargi garde `widenedBy`, une étiquette invalide est retirée', async () => {
    const { normalizeDiscoverResponse } = await import('./discover-normalize')
    const base = { name: 'ACME WEB', siren: '552100554', sources: [], signals: [] }
    const response = normalizeDiscoverResponse({
      candidates: [
        { ...base, widenedBy: { axis: 'skill', tier: 1, code: 'javascript' } },
        { ...base, siren: '552100555', widenedBy: { axis: 'skill', tier: 7, code: 'x' } },
      ],
      query: {},
      degraded: [],
    })
    expect(response.candidates[0]?.widenedBy).toEqual({ axis: 'skill', tier: 1, code: 'javascript' })
    expect(response.candidates[1]?.widenedBy).toBeUndefined()
  })
})
