import { DEMO_MEMBER_OBJECTIVE } from './demo-dataset'
import { DEMO_COMMERCIAL_OBJECTIVES_COVERAGE } from './demo-coverage'

/**
 * Recompte ce que documente {@link DEMO_COMMERCIAL_OBJECTIVES_COVERAGE} —
 * lot FA (#2114.16 à .27) : les sept objectifs commerciaux du `/dashboard`
 * personnel ne doivent pas s'ouvrir « objectif non fixé » sur cinq lignes
 * devant un prospect faute d'avoir étendu le semis existant.
 */
describe('DEMO_COMMERCIAL_OBJECTIVES_COVERAGE — lot FA (#2114.16-.27)', () => {
  it('is documented as seeded (la cible, pas le réalisé)', () => {
    expect(DEMO_COMMERCIAL_OBJECTIVES_COVERAGE.state).toBe('seede')
  })

  it('DEMO_MEMBER_OBJECTIVE seeds all seven target axes — no dashboard row silently unset', () => {
    expect(DEMO_MEMBER_OBJECTIVE.target_meetings).not.toBeNull()
    expect(DEMO_MEMBER_OBJECTIVE.target_accounts).not.toBeNull()
    expect(DEMO_MEMBER_OBJECTIVE.target_revenue).not.toBeNull()
    expect(DEMO_MEMBER_OBJECTIVE.target_qualified_needs).not.toBeNull()
    expect(DEMO_MEMBER_OBJECTIVE.target_placements).not.toBeNull()
    expect(DEMO_MEMBER_OBJECTIVE.target_margin_percent).not.toBeNull()
    expect(DEMO_MEMBER_OBJECTIVE.target_consultants_on_mission).not.toBeNull()
  })

  it('the margin target stays a strictly positive percent (never 0 — that is not an objective)', () => {
    expect(Number(DEMO_MEMBER_OBJECTIVE.target_margin_percent)).toBeGreaterThan(0)
    expect(Number(DEMO_MEMBER_OBJECTIVE.target_margin_percent)).toBeLessThanOrEqual(100)
  })
})
