import { readPlanSignal } from '@bellum/contracts'
import { DEMO_PLAN_TASKS } from './demo-dataset'

/**
 * #4521.6 (craft rule n°9) — la rafale « Traiter : E-mails » ne s'ouvre pas vide de contact, de signal ni de mail
 * générable en démonstration. La carte e-mail du plan montre son contact (résolu depuis `contact_id`), son signal
 * (lu dans la consigne par `readPlanSignal`) et propose « Générer le mail » (moteur de rédaction du composer).
 * Le test dit NON si l'on retire la tâche, son contact, son canal ou le signal de sa consigne.
 */
describe('DEMO_PLAN_TASKS — #4521.6, une carte e-mail du plan complète en démonstration', () => {
  const mails = DEMO_PLAN_TASKS.filter(
    task => task.channel === 'email' && task.executionStatus !== 'done' && task.contact !== null,
  )

  it('au moins une relance e-mail ouverte porte un contact nommé', () => {
    expect(mails.length).toBeGreaterThanOrEqual(1)
  })

  it('elle est due aujourd’hui ou avant : la rafale la voit', () => {
    for (const task of mails) expect(task.dueInDays).not.toBeNull()
    expect(mails.some(task => task.dueInDays !== null && task.dueInDays <= 0)).toBe(true)
  })

  it('sa consigne cite un signal lisible en une ligne', () => {
    expect(mails.some(task => readPlanSignal(task.label) !== null)).toBe(true)
  })
})
