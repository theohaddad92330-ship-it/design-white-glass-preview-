import { DEMO_DISCOVER_MY_TARGET_COVERAGE } from './demo-coverage'
import { DEMO_ESN_PROFILE, DEMO_PROFILE_CONTEXT } from './demo-dataset'

/**
 * #4530.8 / #4529.4 (craft rule n°9) — le bouton « Ma cible » de Découvrir pose le profil de l'espace : en salle de
 * démonstration il doit avoir de quoi poser. La spec confronte ce que `autopilotPlan` (web) lit — secteurs
 * prioritaires, zones de chasse, niveau de décision — au jeu seedé, plutôt que de supposer qu'il est rempli.
 */
describe('couverture démo — Découvrir : « Ma cible » (#4529 / #4530)', () => {
  it('le classement est « seedé », avec sa raison écrite', () => {
    expect(DEMO_DISCOVER_MY_TARGET_COVERAGE.state).toBe('seede')
    expect(DEMO_DISCOVER_MY_TARGET_COVERAGE.reason.length).toBeGreaterThan(40)
  })

  it('SAIT DIRE NON — le profil de démo porte des secteurs prioritaires et une zone de chasse non vides', () => {
    expect(DEMO_ESN_PROFILE.priority_sectors.length).toBeGreaterThan(0)
    expect(DEMO_ESN_PROFILE.geo_zones.length).toBeGreaterThan(0)
  })

  it('le profil idéal de démo porte un niveau de décision et des secteurs', () => {
    expect(DEMO_PROFILE_CONTEXT.idealAccountProfile?.decisionLevel).toBeTruthy()
    expect(DEMO_PROFILE_CONTEXT.idealAccountProfile?.sectorsPriority.length).toBeGreaterThan(0)
  })
})
