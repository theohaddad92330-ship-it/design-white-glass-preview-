import { DEMO_PLAN_TASKS } from './demo-dataset'

/**
 * #3265.13 (épopée #3287) — la carte « Dernier résultat et prochain geste » de
 * la fiche Contact (`ContactLastOutcomeCard`) ne rend RIEN sans issue ni
 * prochain geste : sans semis, elle serait invisible en salle de démonstration.
 * Un même contact porte donc, dans le jeu de démo, une action FAITE avec une
 * issue choisie ET une action ouverte.
 */
describe('DEMO_PLAN_TASKS — #3265.13, la fiche Contact montre issue et prochain geste', () => {
  it('au moins un contact a une action faite avec une issue ET une action ouverte', () => {
    const contacts = new Set(DEMO_PLAN_TASKS.map(task => task.contact).filter((c): c is string => c !== null))
    const shown = [...contacts].filter(contact => {
      const mine = DEMO_PLAN_TASKS.filter(task => task.contact === contact)
      const hasOutcome = mine.some(task => task.executionStatus === 'done' && task.outcome)
      const hasNext = mine.some(task => task.executionStatus !== 'done')
      return hasOutcome && hasNext
    })
    expect(shown.length).toBeGreaterThanOrEqual(1)
  })
})
