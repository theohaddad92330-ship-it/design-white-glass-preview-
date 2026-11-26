import { discoverResponseSchema } from '@bellum/contracts'
import { DEMO_DISCOVER_CONTRACT_MODEL_COVERAGE } from './demo-coverage'
import { demoDiscoverResponse } from './demo-scripts'

/**
 * #2291.2 — « et en démonstration, le modèle de contrat observé et le filtre
 * "recourt au freelance / à la régie" de Découvrir montrent quoi ? »
 *
 * Craft rule n°9 : l'écran n'a ni table ni clé `raw_analysis` à lui — la
 * garde par table ne poserait jamais la question. Ce fichier est l'appelant
 * qui lit la VRAIE réponse scriptée (`demoDiscoverResponse`), pas un
 * commentaire qui l'affirme : la classification `seede` ne vaut que si la salle,
 * dans sa vue PAR DÉFAUT (filtre cible appliqué), montre les trois états —
 * un recours observé que le filtre garde, et un compte non observé que le
 * filtre retire en le DISANT.
 */
describe('#2291.2 — le modèle de contrat observé en démonstration', () => {
  const byDefault = demoDiscoverResponse({})
  const parsed = discoverResponseSchema.parse(byDefault)

  it('est classé seedé, avec sa raison', () => {
    expect(DEMO_DISCOVER_CONTRACT_MODEL_COVERAGE.state).toBe('seede')
    expect(DEMO_DISCOVER_CONTRACT_MODEL_COVERAGE.reason).toContain('#2291.2')
  })

  it('la vue par défaut montre un recours à l’indépendant OBSERVÉ, avec sa source et son volume', () => {
    const observed = parsed.candidates.filter(c => (c.contractModel?.jobOffers?.counts.freelance ?? 0) > 0)
    expect(observed.length).toBeGreaterThan(0)
    for (const candidate of observed) {
      expect(candidate.contractModel?.jobOffers?.source).toBe('France Travail')
      expect(candidate.contractModel?.jobOffers?.total).toBeGreaterThan(0)
    }
  })

  it('et un compte cherché, NON observé — le filtre le retire en le disant, jamais un « non »', () => {
    expect(parsed.candidates.some(c => c.contractModel === null)).toBe(true)
  })

  it('hors cible aussi, une observation SANS indépendant ni régie existe — lue, jamais un « n’y recourt pas »', () => {
    const all = discoverResponseSchema.parse(demoDiscoverResponse({ includeOutOfTarget: true }))
    const salariedOnly = all.candidates.filter(
      c =>
        c.contractModel?.jobOffers &&
        c.contractModel.jobOffers.counts.freelance === 0 &&
        (c.contractModel.publicContracts?.regie ?? 0) === 0,
    )
    expect(salariedOnly.length).toBeGreaterThan(0)
  })
})
