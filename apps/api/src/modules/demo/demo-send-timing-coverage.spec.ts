import { computeSendTiming, type SendTimingObservation } from '@bellum/contracts'
import { DEMO_PLAN_TASKS } from './demo-dataset'

/**
 * #3289 (#3264.31/.32/.33, craft rule n°9) — « Mes relances » montre le créneau
 * appris EN SALLE DE DÉMO. La ligne ne se voit que si `computeSendTiming`, lu
 * sur les gestes FAITS semés, rend un créneau recommandé : ce test rejoue la
 * même mesure que `SendTimingService` sur le jeu de démo.
 */
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const

function observationsOf(tasks: typeof DEMO_PLAN_TASKS): SendTimingObservation[] {
  return tasks.flatMap(task => {
    if (task.executionStatus !== 'done' || !task.channel || !task.completedSlot) return []
    // 2026-09-01 est un mardi : on projette le créneau semé sur une semaine réelle.
    const at = new Date(Date.UTC(2026, 8, 1 + (task.completedSlot.weekday - 2), task.completedSlot.utcHour))
    return [
      {
        channel: task.channel,
        at: at.toISOString(),
        contactTimezone: null,
        outcome: task.outcome ?? null,
        seniority: null,
      },
    ]
  })
}

describe('DEMO_PLAN_TASKS — le créneau appris est visible en démonstration', () => {
  it('rend un créneau recommandé sur le canal e-mail, avec ses comptes', () => {
    const timing = computeSendTiming(observationsOf(DEMO_PLAN_TASKS), { workspaceTimezone: 'Europe/Paris' })
    const email = timing.channels.find(channel => channel.channel === 'email')
    expect(email?.best).toEqual({ weekday: 'tuesday', band: 'morning', answered: 4, attempts: 4 })
    expect(WEEKDAYS).toContain('tuesday')
  })

  it('NON — sans les gestes semés, aucun créneau (le test lit vraiment quelque chose)', () => {
    const without = DEMO_PLAN_TASKS.filter(task => !task.completedSlot)
    const timing = computeSendTiming(observationsOf(without), { workspaceTimezone: 'Europe/Paris' })
    expect(timing.channels).toEqual([])
  })

  it('aucun geste semé ne vise un contact : pas un envoi à un dirigeant réel', () => {
    for (const task of DEMO_PLAN_TASKS.filter(task => task.completedSlot)) expect(task.contact).toBeNull()
  })
})

describe('DEMO_PLAN_TASKS — #3287 (#3265.2), la condition d’arrêt se lit en démonstration', () => {
  it('au moins deux actions ouvertes de SNCF portent leur condition d’arrêt', () => {
    const withStop = DEMO_PLAN_TASKS.filter(task => task.company === 'SNCF' && task.stopCondition)
    expect(withStop.length).toBeGreaterThanOrEqual(2)
  })
})
