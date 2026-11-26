import { DEMO_TASKS } from './demo-dataset'

/**
 * #2392 — craft rule n°9 : la clôture de fin de journée lit `tasks` par le
 * chemin de production. Cette garde tombe si le jeu de démo perd l'une des
 * trois tâches qui remplissent ses sections — l'écran s'ouvrirait alors à moitié
 * vide devant un prospect, sans qu'aucun autre test ne le voie.
 */
describe('Démo — la clôture de fin de journée a de quoi se remplir (#2392)', () => {
  it('une tâche cochée le jour du seed, avec son résultat noté (Résultats)', () => {
    expect(DEMO_TASKS.some(task => task.closed?.status === 'done' && task.closed.resultNote.length > 0)).toBe(true)
  })

  it('une tâche abandonnée avec sa raison (Blocages)', () => {
    expect(DEMO_TASKS.some(task => task.closed?.status === 'cancelled' && task.closed.resultNote.length > 0)).toBe(true)
  })

  it('une promesse créée le jour même, encore ouverte, pour plus tard (Engagements pris)', () => {
    expect(DEMO_TASKS.some(task => task.createdDaysAgo === 0 && !task.closed && task.dueInDays > 0)).toBe(true)
  })

  it("au moins une tâche ouverte due aujourd'hui ou en retard (À décider)", () => {
    expect(DEMO_TASKS.some(task => !task.closed && task.dueInDays <= 0)).toBe(true)
  })
})
