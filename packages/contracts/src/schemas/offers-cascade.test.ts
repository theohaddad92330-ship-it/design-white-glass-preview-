import { describe, expect, it } from 'vitest'
import { OFFERS_CASCADE_TIERS, offersCascadeView, readOffersCascade } from './offers-cascade.js'

const tier = (t: string, status: string, gained = 0) => ({
  tier: t,
  status,
  gained,
  paid: 0,
  cached: 0,
  notAttempted: 0,
})

const payload = (over: Record<string, unknown> = {}) => ({
  floor: 5,
  found: 3,
  belowFloor: true,
  explicit: false,
  reason: 'sous le plancher après toute la cascade',
  paidCalls: 4,
  tiers: [tier('sources', 'tenté', 1), tier('terms', 'tenté', 1), tier('window', 'tenté', 1), tier('group', 'tenté')],
  ...over,
})

// CASCADE-ECRAN — le contrat de `raw_analysis.offersCascade` (moteur : apps/ia offers_cascade.py).
describe('offersCascade — lecture du contrat', () => {
  it('les quatre paliers du moteur, dans l’ordre', () => {
    expect(OFFERS_CASCADE_TIERS).toEqual(['sources', 'terms', 'window', 'group'])
  })

  it('absent ou illisible : null — rien à dire, jamais une mention devinée', () => {
    expect(readOffersCascade(null)).toBeNull()
    expect(readOffersCascade({})).toBeNull()
    expect(readOffersCascade({ offersCascade: 'x' })).toBeNull()
    expect(readOffersCascade({ offersCascade: { floor: 5 } })).toBeNull()
  })

  it('cascade déclenchée : le palier atteint est le dernier TENTÉ', () => {
    const view = offersCascadeView(readOffersCascade({ offersCascade: payload() }))
    expect(view?.widenedTo).toBe('group')
    expect(view?.belowFloor).toBe(true)
    expect(view?.found).toBe(3)
  })

  it('palier non branché ou en échec : ne compte pas comme « atteint »', () => {
    const raw = payload({
      tiers: [tier('sources', 'tenté', 2), tier('terms', 'non branché'), tier('window', 'en échec')],
    })
    expect(offersCascadeView(readOffersCascade({ offersCascade: raw }))?.widenedTo).toBe('sources')
  })

  it('plancher atteint au palier 0 : aucune vue (aucune ligne, aucun texte)', () => {
    const raw = payload({
      belowFloor: false,
      found: 6,
      reason: null,
      tiers: OFFERS_CASCADE_TIERS.map(t => tier(t, 'plancher atteint')),
    })
    expect(offersCascadeView(readOffersCascade({ offersCascade: raw }))).toBeNull()
  })

  it('aucun palier tenté et plancher non atteint : vue sans palier, mais le manque se dit', () => {
    const raw = payload({ tiers: OFFERS_CASCADE_TIERS.map(t => tier(t, 'non branché')) })
    const view = offersCascadeView(readOffersCascade({ offersCascade: raw }))
    expect(view?.widenedTo).toBeNull()
    expect(view?.belowFloor).toBe(true)
  })

  it('aucune offre du métier : found vaut null, jamais 0', () => {
    const view = offersCascadeView(readOffersCascade({ offersCascade: payload({ found: 0 }) }))
    expect(view?.found).toBeNull()
  })
})

// #4646.7 — « found: 0 » avec des appels payés alors que Découvrir avait des offres : le compteur le dit.
describe('offersCascade — offres reprises de Découvrir', () => {
  it('la vue porte le nombre d’offres de Découvrir que la collecte n’a pas retrouvées', () => {
    const view = offersCascadeView(
      readOffersCascade({
        offersCascade: payload({ found: 0, tiers: [tier('sources', 'tenté')], carriedFromDiscover: 3 }),
      }),
    )
    expect(view?.carried).toBe(3)
    expect(view?.found).toBeNull()
  })

  it('la mention existe même quand la cascade n’a rien élargi ni manqué son plancher', () => {
    const view = offersCascadeView(
      readOffersCascade({ offersCascade: payload({ belowFloor: false, tiers: [], carriedFromDiscover: 2 }) }),
    )
    expect(view?.carried).toBe(2)
  })

  it('dit NON : sans offre reprise, aucune mention ; jamais 0', () => {
    const view = offersCascadeView(readOffersCascade({ offersCascade: payload() }))
    expect(view?.carried).toBeNull()
    expect(offersCascadeView(readOffersCascade({ offersCascade: payload({ carriedFromDiscover: 0 }) }))).toBeNull()
  })
})
