import { STALE_ACTION_DAYS } from '@bellum/contracts'
import { DEMO_DOSSIERS, DEMO_PLAN_TASKS } from './demo-dataset'

/**
 * #4485 (craft rule n°9) — le bandeau « N actions en retard de plus de 30 jours — les marquer faites ? » doit se
 * voir en démonstration : il faut des relances OUVERTES en retard au-delà du seuil, sur des comptes réels du jeu.
 */
describe('DEMO_PLAN_TASKS — #4485, des relances ouvertes vieilles de plus de 30 jours', () => {
  const stale = DEMO_PLAN_TASKS.filter(
    task => task.executionStatus !== 'done' && task.dueInDays !== null && -task.dueInDays > STALE_ACTION_DAYS,
  )

  it('sème au moins deux relances ouvertes au-delà du seuil', () => {
    expect(stale.length).toBeGreaterThanOrEqual(2)
  })

  it('chacune vise un compte RÉEL de la salle, jamais un compte inventé', () => {
    const companies = new Set(DEMO_DOSSIERS.map(dossier => dossier.account.company_name))
    for (const task of stale) expect(companies.has(task.company)).toBe(true)
  })

  it('sait dire NON : une relance récente ou faite n’entre pas dans le compte', () => {
    const recent = DEMO_PLAN_TASKS.filter(task => task.dueInDays !== null && task.dueInDays >= -STALE_ACTION_DAYS)
    expect(recent.every(task => !stale.includes(task))).toBe(true)
  })
})
