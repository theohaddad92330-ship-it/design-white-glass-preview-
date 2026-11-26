/**
 * ⚠️ #4016.L10.c revient sur GA-262 (« la mémoire marché ne fabrique jamais
 * d'urgence ») et sur c36 (« un signal isolé reste à vérifier »), délibérément
 * — Louis 11/10 (épopée #4016, L10 : « un signal isolé suffit pour chaud »),
 * lot E6 du 13/10.
 */
import { describe, expect, it } from 'vitest'
import { MARKET_HEAT_MIN_SIGNALS, marketHeatRank } from './market-heat.js'

describe('#4016.L10.c — un signal isolé suffit pour « chaud »', () => {
  it('le plancher vaut UN signal', () => {
    expect(MARKET_HEAT_MIN_SIGNALS).toBe(1)
  })

  it('un signal récent SEUL rend le compte chaud', () => {
    expect(marketHeatRank({ recentSignal: true, marketPaths: null })).toBe(1)
  })

  it('une observation marché SEULE rend le compte chaud — c’est le renversement de GA-262', () => {
    expect(marketHeatRank({ recentSignal: false, marketPaths: 3 })).toBe(1)
  })

  it('le rang est une PRÉSENCE, jamais un volume — 3 et 300 parcours valent pareil', () => {
    expect(marketHeatRank({ recentSignal: false, marketPaths: 300 })).toBe(
      marketHeatRank({ recentSignal: false, marketPaths: 3 }),
    )
  })

  it('SAIT DIRE NON — sans aucun signal, le compte n’est pas chaud (lecture absente comprise)', () => {
    expect(marketHeatRank({ recentSignal: false, marketPaths: null })).toBe(0)
    expect(marketHeatRank({ recentSignal: false, marketPaths: undefined })).toBe(0)
  })
})
