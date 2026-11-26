import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { clientTeamSummary, consultantsExpected, deliveryModeProblems, missionMargin } from '@bellum/contracts'
import { DEMO_SUPERVISED_FORFAIT_COVERAGE } from './demo-coverage'
import { DEMO_DELIVERY_CLIENT, DEMO_SUPERVISED_FORFAIT_MISSION } from './demo-dataset'

/**
 * #3547 — « et en démonstration, le forfait encadré montre quoi ? » (craft rule
 * n°9). Pas de table nouvelle : ce sont des colonnes de `missions`, donc aucune
 * garde par table ne poserait la question. Ce fichier lit le VRAI jeu de données
 * et l'APPELANT du semis — pas un commentaire qui l'affirme.
 */
describe('#3547 — le forfait encadré en démonstration', () => {
  const mission = DEMO_SUPERVISED_FORFAIT_MISSION

  it('est classé seedé, avec sa raison', () => {
    expect(DEMO_SUPERVISED_FORFAIT_COVERAGE.state).toBe('seede')
    expect(DEMO_SUPERVISED_FORFAIT_COVERAGE.reason).toContain('#3547')
  })

  it('est une mission SANS consultant, en forfait encadré cohérent (la contrainte SQL l’exige)', () => {
    expect(mission.contract_kind).toBe('forfait')
    expect(consultantsExpected(mission.delivery_mode)).toBe(false)
    expect(deliveryModeProblems(mission)).toEqual([])
    expect('consultant' in mission).toBe(false)
  })

  it('dit le rôle tenu et une équipe client NOMMÉE — et une marge se calcule SANS consultant', () => {
    expect(mission.supervision_role).toBeTruthy()
    expect(clientTeamSummary(mission)).not.toBeNull()
    const margin = missionMargin({
      dailyRateCents: mission.daily_rate * 100,
      loadedDailyCostCents: mission.loaded_daily_cost_cents,
    })
    expect(margin?.percent).toBeGreaterThan(0)
  })

  it('reste HORS de la liste des missions staffées : les gardes de relevés, facturation et planning lisent celle-ci', () => {
    expect(DEMO_DELIVERY_CLIENT.missions.map(entry => entry.label)).not.toContain(mission.label)
  })

  it('a un APPELANT : le semis de la salle écrit cette mission', () => {
    const seed = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')
    expect(seed).toContain('DEMO_SUPERVISED_FORFAIT_MISSION')
    expect(seed).toContain('seedSupervisedForfaitMission(')
  })
})
