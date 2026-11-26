import { NEXT_ACTIONS_MAX } from '@bellum/contracts'
import { DEMO_PLAN_TASKS } from './demo-dataset'

/**
 * #2923 — LA COUPURE « VOIR PLUS » DES TÂCHES MANUELLES DU PLAN, DÉCLENCHÉE
 * EN DÉMONSTRATION.
 *
 * `UserActionSection` (`ActionPlanBoard.tsx`) coupe les lignes manuelles du
 * plan (`week_index >= MANUAL_ACTION_WEEK_INDEX`) à `NEXT_ACTIONS_MAX` (3) et
 * révèle le reste derrière un bouton « voir plus » — mais SEULEMENT si un
 * compte en porte plus de trois. Avant ce lot, aucun dossier de démonstration
 * n'en portait plus d'un ou deux : le bouton n'apparaissait jamais en salle,
 * un défaut mesuré en recette le 27/09.
 *
 * Cette garde lit `DEMO_PLAN_TASKS` — la source que `seedPlanTasks`
 * (`demo-seed.service.ts`) écrit une-pour-une dans `action_plan_items`, sans
 * transformation de compte — et échoue si aucun dossier vedette n'en
 * accumule assez pour que la coupure se voie.
 */
describe('DEMO_PLAN_TASKS — #2923, un dossier vedette dépasse la coupure « voir plus »', () => {
  it('au moins un compte porte STRICTEMENT plus de NEXT_ACTIONS_MAX tâches manuelles', () => {
    const byCompany = new Map<string, number>()
    for (const task of DEMO_PLAN_TASKS) {
      byCompany.set(task.company, (byCompany.get(task.company) ?? 0) + 1)
    }
    const overflowing = [...byCompany.entries()].filter(([, count]) => count > NEXT_ACTIONS_MAX)
    expect(overflowing.length).toBeGreaterThanOrEqual(1)
  })

  it('SNCF, le dossier vedette visé par #2923, dépasse la coupure', () => {
    const sncfCount = DEMO_PLAN_TASKS.filter(task => task.company === 'SNCF').length
    expect(sncfCount).toBeGreaterThan(NEXT_ACTIONS_MAX)
  })
})
