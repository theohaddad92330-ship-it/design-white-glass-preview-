import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_FORFAIT_PROFILE_NEEDS, DEMO_SUPERVISED_FORFAIT_MISSION } from './demo-dataset'

/**
 * #4270.5 — le profil forfait/conseil se VOIT en démo : un besoin lu comme projet à cadrer (périmètre, budget,
 * équipe côté client) et un besoin gagné suivi comme un projet, lié à la mission en forfait encadré.
 */
describe('démo — profil forfait/conseil (#4270.5)', () => {
  const seed = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')

  it('un besoin à cadrer, renseigné (périmètre + budget), et un besoin gagné', () => {
    const { toScope, won } = DEMO_FORFAIT_PROFILE_NEEDS
    expect(toScope.status).toBe('to_qualify')
    expect(toScope.context.length).toBeGreaterThan(40)
    expect(toScope.budget_cents).toBeGreaterThan(0)
    expect(won.status).toBe('won')
    expect(won.title).not.toBe(toScope.title)
  })

  it('le semis les pose ET rattache la mission en forfait encadré au besoin gagné', () => {
    expect(seed).toContain('seedForfaitProfileNeeds(workspaceId, ownerUserId, account.id, iso)')
    expect(seed).toContain(
      'SET need_id = (SELECT id FROM project_needs WHERE workspace_id = $1 AND title = $2 LIMIT 1)',
    )
    expect(DEMO_SUPERVISED_FORFAIT_MISSION.delivery_mode).toBe('supervised')
  })

  it('la salle reste l’espace staffing : le profil n’est pas semé (la raison est écrite)', () => {
    const coverage = readFileSync(join(__dirname, 'demo-coverage.ts'), 'utf8')
    expect(coverage).toContain('DEMO_FORFAIT_PROFILE_NEEDS')
  })
})
