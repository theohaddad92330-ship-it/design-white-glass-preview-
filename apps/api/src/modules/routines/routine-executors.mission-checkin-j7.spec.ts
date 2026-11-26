import { RoutineExecutors } from './routine-executors'
import type { MissionFeedbackService } from '../delivery/mission-feedback.service'

/**
 * #3413.2 (beta:metier #3413, 30/09/2026) — le rappel du point à sept jours.
 *
 * `checkinJ7ForWorkspace` existe déjà (`MissionFeedbackService`) : il calcule
 * « point en attente » depuis les missions ACTIVES démarrées depuis sept à
 * vingt-et-un jours et sans aucune entrée de feedback. Cette routine ne fait
 * que RAPPELER ce que ce service sait déjà.
 */
function executorOver(missionFeedback?: Partial<MissionFeedbackService>): RoutineExecutors {
  return new RoutineExecutors(
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    missionFeedback as MissionFeedbackService,
  )
}

const NOW = new Date('2026-09-30T09:00:00.000Z')

describe('rappel du point à sept jours', () => {
  it('aucun espace de travail résolu : elle se tait et le dit', async () => {
    const outcome = await executorOver({}).run('mission_checkin_j7_reminder', 'u1', NOW, '')
    expect(outcome.notified).toBe(false)
    expect(outcome.outcome).toContain('Aucun espace de travail résolu')
  })

  it('le suivi de mission n’est pas branché : elle se tait et le dit', async () => {
    const outcome = await executorOver().run('mission_checkin_j7_reminder', 'u1', NOW, 'w1')
    expect(outcome.notified).toBe(false)
    expect(outcome.outcome).toContain('n’est pas disponible')
  })

  it('rien en attente : elle se tait, et le dit comme un fait mesuré', async () => {
    const outcome = await executorOver({
      checkinJ7ForWorkspace: async () => [],
    }).run('mission_checkin_j7_reminder', 'u1', NOW, 'w1')
    expect(outcome.notified).toBe(false)
    expect(outcome.outcome).toBe('Aucun point à sept jours en attente.')
  })

  it('des points en attente : elle notifie et NOMME la mission la plus ancienne', async () => {
    const outcome = await executorOver({
      checkinJ7ForWorkspace: async () => [
        { mission_id: 'm1', label: 'Mission ancienne', started_on: '2026-09-15' },
        { mission_id: 'm2', label: 'Mission récente', started_on: '2026-09-22' },
      ],
    }).run('mission_checkin_j7_reminder', 'u1', NOW, 'w1')
    expect(outcome.notified).toBe(true)
    expect(outcome.outcome).toContain('2 point')
    expect(outcome.notification?.body).toContain('Mission ancienne')
    expect(outcome.notification?.link).toBe('/missions/m1')
  })
})
