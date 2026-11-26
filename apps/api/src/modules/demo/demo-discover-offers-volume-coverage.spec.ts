import { discoverResponseSchema } from '@bellum/contracts'
import { DEMO_DISCOVER_OFFERS_VOLUME_COVERAGE } from './demo-coverage'
import { demoDiscoverResponse } from './demo-scripts'

/**
 * DISCOVER-OFFRES (15/10) — « et en démonstration, le volume d'offres d'une carte montre quoi ? »
 *
 * Craft rule n°9 : l'écran n'a ni table ni clé `raw_analysis` à lui. Ce fichier lit la VRAIE réponse scriptée
 * (`demoDiscoverResponse`) : la classification `seede` ne vaut que si la salle porte réellement un volume mesuré.
 */
describe("DISCOVER-OFFRES — le volume d'offres de Découvrir, en démonstration", () => {
  it('est classé seedé, avec sa raison', () => {
    expect(DEMO_DISCOVER_OFFERS_VOLUME_COVERAGE.state).toBe('seede')
    expect(DEMO_DISCOVER_OFFERS_VOLUME_COVERAGE.reason).toContain('DISCOVER-OFFRES')
  })

  it('une carte de la vue par défaut porte un volume mesuré, 90 jours, France', () => {
    const parsed = discoverResponseSchema.parse(demoDiscoverResponse({ includeOutOfTarget: true }))
    const aubrac = parsed.candidates.find(c => c.name === 'Aubrac Aerostructures (démo)')
    expect(aubrac?.offersVolume).toEqual({ count: 179, windowDays: 90, country: 'FR' })
  })

  it('aucune carte ne porte un volume nul — une absence ne fait aucune ligne', () => {
    const parsed = discoverResponseSchema.parse(demoDiscoverResponse({ includeOutOfTarget: true }))
    const volumes = parsed.candidates.map(c => c.offersVolume)
    expect(volumes.some(v => v === undefined)).toBe(true)
    expect(volumes.every(v => v === undefined || v.count > 0)).toBe(true)
  })
})
