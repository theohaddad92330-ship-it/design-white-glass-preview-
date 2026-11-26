import { compareShadowRead, readyForCutover } from './migration-shadow-compare'

describe('compareShadowRead (#2446.7)', () => {
  it('déclare une correspondance quand les deux lectures sont identiques sur les champs suivis', () => {
    const result = compareShadowRead({ id: '1', amount: 42, label: 'x' }, { id: '1', amount: 42, label: 'x' }, [
      'amount',
      'label',
    ])
    expect(result).toEqual({ matches: true, mismatches: [] })
  })

  it('nomme CHAQUE champ divergent, jamais un verdict binaire sans détail', () => {
    const result = compareShadowRead({ id: '1', amount: 42, label: 'x' }, { id: '1', amount: 43, label: 'y' }, [
      'amount',
      'label',
    ])
    expect(result.matches).toBe(false)
    expect(result.mismatches).toEqual([
      { field: 'amount', oldValue: 42, newValue: 43 },
      { field: 'label', oldValue: 'x', newValue: 'y' },
    ])
  })

  it('une valeur ABSENTE d’un seul côté est un mismatch de présence nommé, jamais une exception', () => {
    const result = compareShadowRead({ id: '1', amount: 42, label: 'x' }, null, ['amount', 'label'])
    expect(result.matches).toBe(false)
    expect(result.mismatches).toEqual([{ field: '__presence__', oldValue: 'present', newValue: 'absent' }])
  })

  it('deux lectures absentes des deux côtés correspondent (rien à comparer, rien de divergent)', () => {
    expect(compareShadowRead(null, null, ['amount'])).toEqual({ matches: true, mismatches: [] })
  })
})

describe('readyForCutover (#2446.7 — jamais couper sur un échantillon insuffisant)', () => {
  it('refuse la coupure tant que le nombre minimal de comparaisons n’est pas atteint, même si tout correspond', () => {
    const results = [{ matches: true, mismatches: [] }]
    expect(readyForCutover(results, { minSamples: 5 })).toEqual({
      ready: false,
      reason: 'échantillon insuffisant : 1/5 comparaisons',
    })
  })

  it('refuse la coupure au moindre mismatch, même après le seuil atteint', () => {
    const results = [
      { matches: true, mismatches: [] },
      { matches: true, mismatches: [] },
      { matches: false, mismatches: [{ field: 'amount', oldValue: 1, newValue: 2 }] },
    ]
    expect(readyForCutover(results, { minSamples: 2 })).toEqual({
      ready: false,
      reason: '1 comparaison divergente sur 3 — aucune coupure tant qu’une seule diverge',
    })
  })

  it('autorise la coupure seulement quand le seuil est atteint ET qu’aucune comparaison ne diverge', () => {
    const results = [
      { matches: true, mismatches: [] },
      { matches: true, mismatches: [] },
    ]
    expect(readyForCutover(results, { minSamples: 2 })).toEqual({
      ready: true,
      reason: '2/2 comparaisons, 0 divergence',
    })
  })
})
