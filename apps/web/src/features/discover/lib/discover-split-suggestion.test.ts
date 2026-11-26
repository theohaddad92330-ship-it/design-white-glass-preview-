import { describe, expect, it } from 'vitest'
import type { DiscoverCandidate } from './discover-types'
import { emptyUnifiedFilters, type UnifiedFilters } from './discover-filters'
import { DISCOVER_SPLIT_RESULT_THRESHOLD, suggestDiscoverSplit } from './discover-split-suggestion'

// #2165.11 — DÉCISION Louis 17/09 midi (QCM Découvrir) : au-delà d'un seuil de
// résultats OU si plusieurs secteurs/zones se mêlent, Laura propose 2 à 3
// sous-recherches NOMMÉES. Le seuil vit à UN seul endroit (GA-26) :
// `DISCOVER_SPLIT_RESULT_THRESHOLD`, importé ici et nulle part réécrit.

function unified(over: Partial<UnifiedFilters> = {}): UnifiedFilters {
  return { ...emptyUnifiedFilters(), ...over }
}

function candidate(over: Partial<DiscoverCandidate> = {}): DiscoverCandidate {
  return {
    name: 'ACME',
    siren: '552100554',
    nafCode: null,
    sector: null,
    city: null,
    department: null,
    headcountRange: null,
    creationDate: null,
    score: 50,
    scoreMax: 100,
    scoreUnmeasured: [],
    dataConfidence: null,
    scoreFactors: [],
    signals: [],
    angle: null,
    suggestedRoles: [],
    portfolioState: 'new',
    accountId: null,
    sources: [],
    ...over,
  }
}

describe('suggestDiscoverSplit (#2165.11)', () => {
  it('ne propose rien tant que rien ne se mêle et que le volume reste sous le seuil', () => {
    const candidates = Array.from({ length: 5 }, () => candidate({ department: '75' }))
    expect(suggestDiscoverSplit(candidates, unified())).toBeNull()
  })

  // #3876 (VU EN PASSANT, lot V09 08/10) — RENVERSEMENT ASSUMÉ et daté de la
  // décision du 17/09 ci-dessus : « diviser cette recherche » se proposait dès
  // 2 secteurs cochés, volume ou pas — recette prod 08/10, seuil jugé trop bas.
  // Quelques secteurs cochés ensemble sont un choix de comparaison ordinaire,
  // pas une recherche à diviser ; seuls PLUS DE `MIXED_SECTORS_COUNT_THRESHOLD`
  // secteurs, OU un volume réel de résultats, justifient la coupure.
  it('sait dire NON — 2 à 5 secteurs cochés ensemble, sous le seuil de volume : rien à diviser', () => {
    const filters = unified({ sectors: ['banking', 'insurance'] })
    expect(suggestDiscoverSplit([candidate()], filters)).toBeNull()
    const five = unified({ sectors: ['banking', 'insurance', 'retail', 'aerospace', 'health'] })
    expect(suggestDiscoverSplit([candidate()], five)).toBeNull()
  })

  it('au-delà de 5 secteurs cochés ⇒ une sous-recherche PAR secteur, même sous le seuil de volume', () => {
    const filters = unified({ sectors: ['banking', 'insurance', 'retail', 'aerospace', 'health', 'energy'] })
    const suggestion = suggestDiscoverSplit([candidate()], filters)
    expect(suggestion?.reason).toBe('mixed_sectors')
    expect(suggestion?.subSearches.map(s => s.value)).toEqual(['banking', 'insurance', 'retail'])
    expect(suggestion?.subSearches[0].patch).toEqual({ sectors: ['banking'] })
  })

  it('2 secteurs cochés ET un volume réel de résultats ⇒ une sous-recherche PAR secteur', () => {
    const filters = unified({ sectors: ['banking', 'insurance'] })
    const candidates = Array.from({ length: DISCOVER_SPLIT_RESULT_THRESHOLD + 1 }, () => candidate())
    const suggestion = suggestDiscoverSplit(candidates, filters)
    expect(suggestion?.reason).toBe('mixed_sectors')
    expect(suggestion?.subSearches.map(s => s.value)).toEqual(['banking', 'insurance'])
  })

  it('retient au plus 3 secteurs — 2 à 3 sous-recherches, jamais plus', () => {
    const filters = unified({
      sectors: ['banking', 'insurance', 'retail', 'aerospace', 'health', 'energy'],
    })
    const suggestion = suggestDiscoverSplit([candidate()], filters)
    expect(suggestion?.subSearches).toHaveLength(3)
  })

  it('sait dire NON — un seul secteur coché, jamais un déclencheur', () => {
    const filters = unified({ sectors: ['banking'] })
    expect(suggestDiscoverSplit([candidate()], filters)).toBeNull()
  })

  it('trop de résultats ET plusieurs départements observés, sans zone choisie ⇒ une sous-recherche PAR département', () => {
    const candidates = [
      ...Array.from({ length: 120 }, () => candidate({ department: '75' })),
      ...Array.from({ length: 80 }, () => candidate({ department: '69' })),
      ...Array.from({ length: 10 }, () => candidate({ department: '13' })),
    ]
    expect(candidates.length).toBeGreaterThan(DISCOVER_SPLIT_RESULT_THRESHOLD)
    const suggestion = suggestDiscoverSplit(candidates, unified())
    expect(suggestion?.reason).toBe('mixed_zones')
    expect(suggestion?.subSearches.map(s => s.value)).toEqual(['75', '69', '13'])
    expect(suggestion?.subSearches[0].patch).toEqual({ department: '75' })
  })

  it('sait dire NON — le volume dépasse le seuil mais une seule zone observée : rien à nommer, pas de coupure inventée', () => {
    const candidates = Array.from({ length: DISCOVER_SPLIT_RESULT_THRESHOLD + 50 }, () =>
      candidate({ department: '75' }),
    )
    expect(suggestDiscoverSplit(candidates, unified())).toBeNull()
  })

  it('sait dire NON — plusieurs départements observés mais sous le seuil de volume', () => {
    const candidates = [candidate({ department: '75' }), candidate({ department: '69' })]
    expect(suggestDiscoverSplit(candidates, unified())).toBeNull()
  })

  it('une zone déjà choisie dans le rail ⇒ jamais de sous-recherche par département (le rail la porte déjà)', () => {
    const candidates = [
      ...Array.from({ length: 120 }, () => candidate({ department: '75' })),
      ...Array.from({ length: 120 }, () => candidate({ department: '69' })),
    ]
    expect(suggestDiscoverSplit(candidates, unified({ department: '75' }))).toBeNull()
    expect(suggestDiscoverSplit(candidates, unified({ region: ['Île-de-France'] }))).toBeNull()
  })

  it('priorité aux secteurs sur les zones quand les deux se mêlent à la fois', () => {
    const filters = unified({ sectors: ['banking', 'insurance'] })
    const candidates = [
      ...Array.from({ length: 120 }, () => candidate({ department: '75' })),
      ...Array.from({ length: 120 }, () => candidate({ department: '69' })),
    ]
    expect(suggestDiscoverSplit(candidates, filters)?.reason).toBe('mixed_sectors')
  })
})
