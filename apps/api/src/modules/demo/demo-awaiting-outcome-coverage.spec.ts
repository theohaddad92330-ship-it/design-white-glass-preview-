import { DEMO_PLAN_TASKS } from './demo-dataset'

/**
 * #3211.9 (#3234, lot M11 09/10) — parité démo (craft rule 9) de la file
 * « Issues à déclarer » du Centre d'actions : elle lit `action_plan_items`
 * (table déjà SEMÉE) et montre les actions FAITES sans issue de moins de
 * 30 jours. Le jeu en porte au moins une — complétée par preuve d'envoi, issue
 * jamais choisie — sinon la file serait un écran livré mais vide en salle.
 */
describe('démo — file des issues à déclarer', () => {
  it('au moins une action faite, sans issue, de moins de 30 jours', () => {
    const awaiting = DEMO_PLAN_TASKS.filter(
      task =>
        task.executionStatus === 'done' &&
        (task.outcome ?? null) === null &&
        task.completedSlot === undefined &&
        (task.completedDaysAgo ?? 0) < 30,
    )
    expect(awaiting.length).toBeGreaterThan(0)
    expect(awaiting.every(task => task.label.trim().length > 0)).toBe(true)
  })
})
