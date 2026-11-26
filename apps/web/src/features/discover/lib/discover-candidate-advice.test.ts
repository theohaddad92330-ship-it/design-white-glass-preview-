import { describe, expect, it } from 'vitest'
import { candidateAdvice } from './discover-candidate-advice'
import type { DiscoverCandidate } from './discover-types'

const candidate = (over: Partial<DiscoverCandidate> = {}): DiscoverCandidate =>
  ({ signals: [], suggestedRoles: [], barrier: null, ...over }) as unknown as DiscoverCandidate

describe('candidateAdvice (#3408.2)', () => {
  it('un compte ouvrable avec un rôle suggéré : première action nommée sur ce rôle, pas de risque', () => {
    const advice = candidateAdvice(
      candidate({ suggestedRoles: [{ title: 'DSI' }] as unknown as DiscoverCandidate['suggestedRoles'] }),
      'reachable',
    )
    expect(advice.firstAction).toEqual({ key: 'reachableRole', role: 'DSI' })
    expect(advice.risk).toBeNull()
  })

  it('hors de portée : le risque reprend le libellé de classe d’accès, aucune première action', () => {
    const advice = candidateAdvice(
      candidate({ barrier: { label: 'Grand compte verrouillé' } as unknown as DiscoverCandidate['barrier'] }),
      'out_of_reach',
    )
    expect(advice.risk).toEqual({ key: 'barrier', label: 'Grand compte verrouillé' })
    expect(advice.firstAction).toBeNull()
  })

  it('périmètre : technologies NOMMÉES par les signaux, dédoublonnées, trois au plus — jamais devinées', () => {
    const signals = [{ technologies: ['Java', 'Kafka'] }, { technologies: ['Java', 'AWS', 'Go'] }, {}]
    expect(
      candidateAdvice(candidate({ signals: signals as unknown as DiscoverCandidate['signals'] }), 'reachable').scope,
    ).toEqual(['Java', 'Kafka', 'AWS'])
    expect(candidateAdvice(candidate(), 'reachable').scope).toEqual([])
  })

  it('un compte ouvrable mais au delivery incompatible porte ce risque', () => {
    const signals = [{ deliveryFit: 'incompatible' }]
    expect(
      candidateAdvice(candidate({ signals: signals as unknown as DiscoverCandidate['signals'] }), 'reachable').risk,
    ).toEqual({
      key: 'deliveryIncompatible',
    })
  })

  it('#3408 — sans technologie nommée par une offre, le périmètre lit la pile OBSERVÉE ; les offres priment ; rien sinon', () => {
    expect(candidateAdvice(candidate({ technologiesObserved: ['Python', 'Kafka'] }), 'reachable').scope).toEqual([
      'Python',
      'Kafka',
    ])
    const named = candidate({
      signals: [{ technologies: ['Java'] }] as unknown as DiscoverCandidate['signals'],
      technologiesObserved: ['Python'],
    })
    expect(candidateAdvice(named, 'reachable').scope).toEqual(['Java'])
    expect(candidateAdvice(candidate(), 'reachable').scope).toEqual([])
  })
})
