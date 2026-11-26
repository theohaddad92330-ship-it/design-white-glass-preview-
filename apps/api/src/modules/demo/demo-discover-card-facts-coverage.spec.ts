import { discoverResponseSchema, offerOriginLabel, selectCardFacts } from '@bellum/contracts'
import { DEMO_DISCOVER_CARD_FACTS_COVERAGE } from './demo-coverage'
import { demoDiscoverResponse } from './demo-scripts'

/**
 * #4068 (lot DECOUVRIR-CARTE) — « et en démonstration, la carte de Découvrir
 * hiérarchise-t-elle ses signaux ? » (craft rule n°9). Lit la VRAIE réponse
 * scriptée, triée par le MÊME contrat que l'écran.
 */
const AUBRAC = 'Aubrac Aerostructures (démo)'

function aubracFacts() {
  const response = discoverResponseSchema.parse(demoDiscoverResponse({}))
  const card = response.candidates.find(c => c.name === AUBRAC)
  if (!card) throw new Error('carte Aubrac absente de la vue par défaut')
  return selectCardFacts(card.signals, { now: new Date(), companyName: card.name })
}

describe('#4068 — la carte de Découvrir en démonstration', () => {
  it('est classée seedée, avec sa raison', () => {
    expect(DEMO_DISCOVER_CARD_FACTS_COVERAGE.state).toBe('seede')
    expect(DEMO_DISCOVER_CARD_FACTS_COVERAGE.reason).toContain('#4068')
  })

  it('montre un recrutement parmi ≤ 5 forts, et du contexte (≤ 10) sous le détail', () => {
    const { strong, context } = aubracFacts()
    expect(strong.length).toBeGreaterThan(0)
    expect(strong.length).toBeLessThanOrEqual(5)
    expect(strong.some(f => f.nature === 'hiring')).toBe(true)
    expect(context.map(f => f.nature)).toEqual(expect.arrayContaining(['financial', 'event']))
    expect(context.length).toBeLessThanOrEqual(10)
  })

  it('#4115 — une offre d’alternance est visible en contexte, jamais parmi les forts', () => {
    const { strong, context } = aubracFacts()
    expect(context.map(f => f.nature)).toContain('work_study')
    expect(strong.map(f => f.nature)).not.toContain('work_study')
  })

  it('le résultat repris par deux sources fait UNE ligne, qui garde le lien ; aucun acte de capital', () => {
    const { strong, context } = aubracFacts()
    const financial = context.filter(f => f.nature === 'financial')
    expect(financial).toHaveLength(1)
    expect(financial[0]?.url).toMatch(/^https:\/\/example\.org\//)
    expect([...strong, ...context].some(f => /capital/i.test(f.label))).toBe(false)
  })
})

describe('#5010.3 — le site de publication d’une offre en démonstration', () => {
  it('au moins une offre de Découvrir porte une URL de site d’emploi reconnu', () => {
    const response = discoverResponseSchema.parse(demoDiscoverResponse({}))
    const urls = response.candidates.flatMap(c => c.signals.filter(s => s.type === 'hiring').map(s => s.url ?? ''))
    expect(urls.some(u => offerOriginLabel(u) !== null)).toBe(true)
  })
})
