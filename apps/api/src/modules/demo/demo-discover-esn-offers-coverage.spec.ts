import { DEMO_DISCOVER_ESN_OFFERS_COVERAGE } from './demo-coverage'
import { discoverResponseSchema } from '@bellum/contracts'
import { demoDiscoverResponse } from './demo-scripts'

/**
 * Lot T point 6 (craft rule n°9) — la salle montre une ESN reconnue par ses OFFRES avec son motif. La spec rejoue la
 * liste scriptée de `/discover/registry` : la ligne est là, porte `isEsnPeer` + `esnRecognition: 'offers'`, ses offres
 * disent « chez nos clients », et une ESN reconnue par son NAF ne porte AUCUN motif (jamais un motif inventé).
 */
describe('couverture démo — Découvrir : ESN reconnue par ses offres (lot T)', () => {
  const candidates = discoverResponseSchema.parse(demoDiscoverResponse({ includeOutOfTarget: true }))
    .candidates as unknown as Record<string, unknown>[]

  it('le classement est « seedé », avec sa raison écrite', () => {
    expect(DEMO_DISCOVER_ESN_OFFERS_COVERAGE.state).toBe('seede')
    expect(DEMO_DISCOVER_ESN_OFFERS_COVERAGE.reason.length).toBeGreaterThan(40)
  })

  it('Calderis (NAF 71.12B) est une ESN reconnue par ses offres, motif posé', () => {
    const row = candidates.find(c => c.name === 'Calderis Ingénierie (démo)')
    expect(row).toMatchObject({ nafCode: '71.12B', isEsnPeer: true, esnRecognition: 'offers' })
    const labels = JSON.stringify(row?.signals)
    expect(labels).toMatch(/chez nos clients/i)
    expect(labels).toMatch(/intercontrat/i)
  })

  it('SAIT DIRE NON — Orvane (ESN par son NAF 62.02A) ne porte aucun motif', () => {
    const row = candidates.find(c => c.name === 'Orvane Digital Services (démo)')
    expect(row?.isEsnPeer).toBe(true)
    expect(row?.esnRecognition).toBeUndefined()
  })

  it('SAIT DIRE NON — un client final ne porte ni drapeau ESN ni motif', () => {
    for (const c of candidates.filter(c => c.name === 'Thales' || c.name === 'Orange')) {
      expect(c.isEsnPeer).toBeUndefined()
      expect(c.esnRecognition).toBeUndefined()
    }
  })
})
