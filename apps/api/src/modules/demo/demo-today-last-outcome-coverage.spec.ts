import { DEMO_DOSSIERS, DEMO_PLAN_TASKS } from './demo-dataset'
import { DEMO_TODAY_LAST_OUTCOME_COVERAGE } from './demo-coverage'

/**
 * #3265.13 (épopée #3287) — LE DERNIER RÉSULTAT DÉCLARÉ, VISIBLE SUR LA
 * CARTE « AUJOURD'HUI » (craft rule n°9).
 *
 * `PriorityCard` lit `action_plan_items` (déjà classée SEEDÉE) pour son
 * dernier résultat déclaré. `BriefingService.buildDemo` ne porte que les
 * TROIS premiers dossiers seedés sur « Aujourd'hui » : sans une ligne FAITE
 * qui porte une issue sur l'un des trois, la ligne resterait invisible en
 * salle malgré le semis. Cette garde SAIT DIRE NON : elle rougit si le
 * compte visé sort des trois premiers, ou si sa ligne FAITE perd son issue.
 */
describe('couverture démo — dernier résultat déclaré sur Aujourd’hui (#3265.13)', () => {
  it('SNCF est parmi les trois premiers dossiers seedés (ordre de DEMO_DOSSIERS)', () => {
    const firstThree = DEMO_DOSSIERS.slice(0, 3).map(dossier => dossier.account.company_name)
    expect(firstThree).toContain('SNCF')
  })

  it('SNCF porte au moins une action FAITE avec une issue déclarée', () => {
    const thalesOutcomes = DEMO_PLAN_TASKS.filter(
      task => task.company === 'SNCF' && task.executionStatus === 'done' && task.outcome != null,
    )
    expect(thalesOutcomes.length).toBeGreaterThanOrEqual(1)
  })

  it('cette action FAITE sort du plan à 4 semaines (aucune échéance)', () => {
    const thalesOutcome = DEMO_PLAN_TASKS.find(
      task => task.company === 'SNCF' && task.executionStatus === 'done' && task.outcome != null,
    )
    expect(thalesOutcome?.dueInDays).toBeNull()
  })

  it('reste classée SEEDÉE, avec sa raison écrite', () => {
    expect(DEMO_TODAY_LAST_OUTCOME_COVERAGE.state).toBe('seede')
    expect(DEMO_TODAY_LAST_OUTCOME_COVERAGE.reason.length).toBeGreaterThan(200)
  })
})
