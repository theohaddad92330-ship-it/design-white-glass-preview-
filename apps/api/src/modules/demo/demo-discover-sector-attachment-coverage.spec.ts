import { DEMO_DISCOVER_SECTOR_ATTACHMENT_COVERAGE } from './demo-coverage'
import { demoDiscoverResponse } from './demo-scripts'

/** #4358.4 — le rattachement au secteur par l'activité, en démonstration (craft rule n°9). */
describe('#4358.4 — secteur lu par l’activité, en démonstration', () => {
  it('est classé seedé, avec sa raison', () => {
    expect(DEMO_DISCOVER_SECTOR_ATTACHMENT_COVERAGE.state).toBe('seede')
    expect(DEMO_DISCOVER_SECTOR_ATTACHMENT_COVERAGE.reason).toContain('#4358')
  })

  it('une place de marché au NAF 46.90Z porte son rattachement par l’activité', () => {
    const response = demoDiscoverResponse({ includeOutOfTarget: true }) as {
      candidates: Array<Record<string, unknown>>
    }
    const card = response.candidates.find(c => c['name'] === 'Marché Reconditionné (démo)')
    expect(card?.['qualification']).toMatchObject({
      verdict: 'recommended',
      sectorAttachment: { sector: 'ecommerce', via: 'activity' },
    })
  })
})
