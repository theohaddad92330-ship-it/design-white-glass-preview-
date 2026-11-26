import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { digestLines } from '../manager/manager-digest.service'
import { DEMO_HANDOFF_NOTE, DEMO_MANAGER_DIGEST, DEMO_TEAM_COLLEAGUE_ID } from './demo-team-continuity'

/**
 * #4158.28 / .30 / .31 — la continuité d'équipe est montrée en salle (craft rule n°9), sans inventer de
 * personne ni de classement.
 */
describe('la salle montre la continuité d’équipe', () => {
  const seed = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')

  it('le digest de la salle est celui que le produit réel produirait pour ces mesures', () => {
    const lines = digestLines({
      unassignedAccounts: 3,
      openInterventions: 2,
      actionsDone: 14,
      actionsOverdue: 5,
      watchingAccounts: 7,
    })
    expect(DEMO_MANAGER_DIGEST.body).toBe(lines.join('\n'))
  })

  it('le digest ne nomme personne et ne porte aucune probabilité', () => {
    expect(DEMO_MANAGER_DIGEST.body).not.toMatch(/%|probab|@/i)
  })

  it('la note de passation est une vraie note, pas un marque-place', () => {
    expect(DEMO_HANDOFF_NOTE.trim().length).toBeGreaterThan(40)
    expect(DEMO_TEAM_COLLEAGUE_ID).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('le semis borne ses écritures à l’espace de la salle — jamais un UPDATE sans lui', () => {
    const start = seed.indexOf('private async seedTeamContinuity')
    const method = seed.slice(start, seed.indexOf('\n  }\n', start) + 5)
    expect(method).toContain('WHERE workspace_id = $1 AND created_by IS NULL')
    expect(method).toContain('a.workspace_id = $4')
    expect(method).not.toMatch(/\bDELETE\b/i)
  })

  it('le semis est appelé depuis le semis de la salle', () => {
    expect(seed).toContain('await this.seedTeamContinuity(workspaceId, ownerUserId)')
  })
})
