import { DEMO_ACTIVE_PARTNER_STAGE_COVERAGE, DEMO_SEEDED_TABLES } from './demo-coverage'
import { DEMO_PARTNER_RELATIONS } from './demo-dataset'

/**
 * #2371.4 (#2887) — le 10e stade « partenaire actif » est classé « vide à
 * dessein » en démo. La garde vérifie que la RAISON tient encore : si la salle
 * cessait de semer un partenaire à placements en cours, ou si la décision
 * « une ESN partenaire n'est pas un compte » n'était plus citée, elle rougit.
 */
describe('démo — le stade « partenaire actif » (#2371.4)', () => {
  it('est classé, avec sa raison écrite', () => {
    expect(DEMO_ACTIVE_PARTNER_STAGE_COVERAGE.state).toBe('vide_a_dessein')
    expect(DEMO_ACTIVE_PARTNER_STAGE_COVERAGE.reason).toContain('demo-partner-esn-not-accounts.spec.ts')
  })

  it('la relation partenaire, elle, reste semée avec des placements en cours', () => {
    expect(DEMO_SEEDED_TABLES).toContain('partner_relations')
    expect(DEMO_PARTNER_RELATIONS.some(partner => partner.placementsActive > 0)).toBe(true)
  })
})
