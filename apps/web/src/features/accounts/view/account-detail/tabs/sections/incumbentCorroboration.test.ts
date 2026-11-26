import { MARKET_MEMORY_MIN_PATHS, type MarketEsnObserved } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { corroboratingPaths } from './incumbentCorroboration'

const observed = (over: Partial<MarketEsnObserved> = {}): MarketEsnObserved => ({
  esnName: 'ALTEN',
  persons: MARKET_MEMORY_MIN_PATHS,
  certainty: 'moyenne',
  ...over,
})

describe('corroboratingPaths — #1607.3', () => {
  it('corrobore un nom observé à ou au-dessus du seuil, avec son compte exact', () => {
    expect(corroboratingPaths('ALTEN', [observed({ persons: MARKET_MEMORY_MIN_PATHS })])).toEqual({
      kind: 'exact',
      count: MARKET_MEMORY_MIN_PATHS,
    })
    expect(corroboratingPaths('ALTEN', [observed({ persons: 9 })])).toEqual({ kind: 'exact', count: 9 })
  })

  it('SOUS le seuil, dit la FOURCHETTE « 1-2 » (#4016 L10) — jamais le compte exact, jamais un zéro', () => {
    expect(corroboratingPaths('ALTEN', [observed({ persons: MARKET_MEMORY_MIN_PATHS - 1 })])).toEqual({
      kind: 'range',
      label: '1-2',
    })
    expect(corroboratingPaths('ALTEN', [observed({ persons: 1 })])).toEqual({ kind: 'range', label: '1-2' })
    expect(corroboratingPaths('ALTEN', [observed({ persons: 0 })])).toBeNull()
  })

  it('une ESN absente du corpus n’est jamais un « non » — silence, pas une valeur', () => {
    expect(corroboratingPaths('Capgemini', [observed({ esnName: 'ALTEN' })])).toBeNull()
    expect(corroboratingPaths('Capgemini', [])).toBeNull()
    expect(corroboratingPaths('Capgemini', undefined)).toBeNull()
  })

  it('ignore la casse et les accents, mais reste conservateur sur le reste', () => {
    expect(corroboratingPaths('alten', [observed({ esnName: 'ALTEN' })])).not.toBeNull()
    expect(corroboratingPaths('Générale', [observed({ esnName: 'GENERALE' })])).not.toBeNull()
    // ⚠️ Conservateur PAR CONCEPTION : « Groupe SII » et « SII » ne sont PAS
    // rapprochés ici (contrairement à `marketMatchKey` côté API) — un faux
    // positif de corroboration affirmerait un fait faux, un faux négatif est
    // seulement un signal en moins.
    expect(corroboratingPaths('Groupe SII', [observed({ esnName: 'SII' })])).toBeNull()
  })

  it('un nom vide ne corrobore jamais rien', () => {
    expect(corroboratingPaths('', [observed()])).toBeNull()
    expect(corroboratingPaths('   ', [observed()])).toBeNull()
  })
})
