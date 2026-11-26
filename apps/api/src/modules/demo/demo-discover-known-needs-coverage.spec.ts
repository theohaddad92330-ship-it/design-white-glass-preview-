import { discoverResponseSchema } from '@bellum/contracts'
import { DEMO_DISCOVER_KNOWN_NEEDS_COVERAGE } from './demo-coverage'
import { DEMO_DELIVERY_CARRIER } from './demo-dataset'
import { DEMO_DISCOVER_OWNED_CANDIDATE_NAMES, demoDiscoverResponse } from './demo-scripts'

/**
 * #3819.1 — « et en démonstration, les « besoins connus » d'une carte de
 * Découvrir montrent quoi ? »
 *
 * Renversé le 11/10/2026 (lot RBB2) : la classification passe de « vide à
 * dessein » à SEEDÉE. La liste reste scriptée (aucun `accountId` ni décompte
 * écrit ici) ; c'est la carte du compte client semé que le contrôleur rapproche
 * du vrai portefeuille (`discover-demo-known-needs.spec.ts`). Cette garde
 * prouve que la carte existe dans la liste scriptée, dans la vue PAR DÉFAUT
 * (cible déclarée), et qu'aucun nombre n'y est inventé.
 */
describe('#3819.1 — les besoins connus de Découvrir, en démonstration', () => {
  it('est classée seedée, avec sa raison', () => {
    expect(DEMO_DISCOVER_KNOWN_NEEDS_COVERAGE.state).toBe('seede')
    expect(DEMO_DISCOVER_KNOWN_NEEDS_COVERAGE.reason).toContain('#3819.1')
  })

  it('le compte client semé est une carte de la vue par défaut, sans accountId ni décompte écrits à la main', () => {
    const parsed = discoverResponseSchema.parse(demoDiscoverResponse({}))
    expect(DEMO_DISCOVER_OWNED_CANDIDATE_NAMES).toEqual([DEMO_DELIVERY_CARRIER])
    const card = parsed.candidates.find(c => c.name === DEMO_DELIVERY_CARRIER)
    expect(card).toBeDefined()
    expect(card?.accountId).toBeNull()
    expect(card?.knownNeedsCount).toBeUndefined()
  })

  it('aucune autre carte scriptée ne porte de compte ni de décompte — jamais un compte inventé', () => {
    const parsed = discoverResponseSchema.parse(demoDiscoverResponse({ includeOutOfTarget: true }))
    for (const c of parsed.candidates) {
      expect(c.accountId).toBeNull()
      expect(c.knownNeedsCount).toBeUndefined()
    }
  })
})
