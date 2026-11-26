import { demoRealCompanySignals } from './demo-discover-real-companies'
import { DEMO_DISCOVER_OFFER_CONTRACT_COVERAGE } from './demo-coverage'

/**
 * #5000.2 (craft rule n°9) — le type de contrat se lit sur la carte Découvrir : la démo en sème PLUSIEURS, et au
 * moins une offre qui n'en déclare aucun (la carte dit alors « Contrat non précisé », jamais une ligne vide).
 */
describe('#5000.2 — la démo sème des types de contrat variés sur les offres de Découvrir', () => {
  const signals = Array.from({ length: 12 }, (_, rank) => demoRealCompanySignals(rank)).flat()

  it('au moins deux types déclarés distincts', () => {
    const declared = new Set(signals.map(s => s.contractType).filter(Boolean))
    expect(declared.size).toBeGreaterThanOrEqual(2)
  })

  it('au moins une offre sans contrat déclaré (le « non précisé » se voit en démo)', () => {
    expect(signals.some(s => !s.contractType)).toBe(true)
  })

  it('est classée « seedée » dans demo-coverage', () => {
    expect(DEMO_DISCOVER_OFFER_CONTRACT_COVERAGE.state).toBe('seede')
  })
})
