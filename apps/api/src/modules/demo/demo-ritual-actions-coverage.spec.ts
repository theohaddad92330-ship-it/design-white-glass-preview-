import { RITUAL_KEYS } from '@bellum/contracts'
import { DEMO_TASKS } from './demo-dataset'

/**
 * #3271.8 reste (épopée #3298) — « actions créées » par rituel doit se VOIR en
 * salle de démonstration (craft rule 9) : /team › Rituels lit `tasks.ritual_key`.
 */
describe('démo — actions créées par rituel', () => {
  const tagged = DEMO_TASKS.filter(task => task.ritualKey !== undefined)

  it('au moins un rituel porte des actions semées, avec une clé du catalogue', () => {
    expect(tagged.length).toBeGreaterThan(0)
    for (const task of tagged) expect(RITUAL_KEYS).toContain(task.ritualKey)
  })

  it("toutes les tâches ne viennent pas d'un rituel — un rituel sans action n'affiche aucune ligne", () => {
    expect(tagged.length).toBeLessThan(DEMO_TASKS.length)
    expect(new Set(tagged.map(task => task.ritualKey)).size).toBeLessThan(RITUAL_KEYS.length)
  })
})
