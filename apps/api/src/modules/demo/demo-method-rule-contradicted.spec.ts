import { METHOD_RULE_PLAN_STEP, workspaceDeactivatedRuleIds } from '@bellum/contracts'
import { DEMO_PLAN_TASKS } from './demo-dataset'

/**
 * #3274.4 (recette prod 02/10) — « après 5 issues négatives sous une même
 * règle, elle disparaît des citations » n'était pas jouable en démonstration :
 * aucune ligne de plan semée ne portait `method_rule`. La salle sème désormais
 * cinq actions FAITES, sans résultat, sous la règle du plan de compte
 * hebdomadaire — sur le client d'exemple fictif, jamais sur un compte réel.
 */
describe('démo — une règle de méthode contredite par les résultats de la salle (#3274.4)', () => {
  const rows = DEMO_PLAN_TASKS.map(task => ({
    method_rule: task.methodRule ?? null,
    outcome: task.executionStatus === 'done' ? (task.outcome ?? null) : null,
  }))

  it('le calcul réel (workspaceDeactivatedRuleIds) écarte la règle du plan hebdomadaire pour la salle', () => {
    expect(workspaceDeactivatedRuleIds(rows)).toEqual([METHOD_RULE_PLAN_STEP])
  })

  it('aucune de ces lignes ne vise un compte réel, et toutes sont faites', () => {
    const carried = DEMO_PLAN_TASKS.filter(task => task.methodRule)
    expect(carried.length).toBeGreaterThanOrEqual(5)
    for (const task of carried) {
      expect(task.company).toBe('SNCF')
      expect(task.executionStatus).toBe('done')
    }
  })
})
