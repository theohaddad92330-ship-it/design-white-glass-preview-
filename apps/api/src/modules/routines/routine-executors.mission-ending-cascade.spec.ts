import { RoutineExecutors } from './routine-executors'
import type { AtsService } from '../ats/ats.service'
import type { AtsMission } from '@bellum/contracts'
import { missionEndingStage, MISSION_ENDING_STAGES_DAYS } from './mission-ending-cascade'

/**
 * #2398.5 (épopée #2843) — la CASCADE T-45 / T-30 / T-15 des fins de mission.
 * Avant : un seuil UNIQUE de trente jours, une seule notification qui ne disait
 * pas à quel palier de la préparation on en était.
 */
function executorOver(ats: Partial<AtsService>): RoutineExecutors {
  const none = undefined as never
  return new RoutineExecutors(none, none, none, ats as AtsService, none, none, none, none, none, none)
}

function mission(id: string, daysRemaining: number | null): AtsMission {
  return {
    id,
    title: `Mission ${id}`,
    companyName: `Client ${id}`,
    consultantName: `Consultant ${id}`,
    startsAt: null,
    endsAt: null,
    daysRemaining,
  } as AtsMission
}

const NOW = new Date('2026-10-27T08:00:00.000Z')

describe('missionEndingStage — les trois paliers', () => {
  it('nomme T-15 / T-30 / T-45 selon les jours restants, et rien au-delà', () => {
    expect(MISSION_ENDING_STAGES_DAYS).toEqual([15, 30, 45])
    expect(missionEndingStage(0)).toBe('T-15')
    expect(missionEndingStage(15)).toBe('T-15')
    expect(missionEndingStage(16)).toBe('T-30')
    expect(missionEndingStage(30)).toBe('T-30')
    expect(missionEndingStage(31)).toBe('T-45')
    expect(missionEndingStage(45)).toBe('T-45')
    expect(missionEndingStage(46)).toBeNull()
    expect(missionEndingStage(-1)).toBeNull()
    expect(missionEndingStage(null)).toBeNull()
  })
})

describe('mission_ending — cascade T-45 / T-30 / T-15', () => {
  it('lit le snapshot ATS sur 45 jours (et plus 30)', async () => {
    const snapshot = jest.fn(async () => ({ endingMissions: [] }))
    await executorOver({ snapshot } as never).run('mission_ending', 'u1', NOW, 'w1')
    expect(snapshot).toHaveBeenCalledWith('u1', { endingWithinDays: 45 })
  })

  it('aucune mission : elle se tait et le dit', async () => {
    const outcome = await executorOver({ snapshot: async () => ({ endingMissions: [] }) } as never).run(
      'mission_ending',
      'u1',
      NOW,
      'w1',
    )
    expect(outcome.notified).toBe(false)
    expect(outcome.outcome).toContain('quarante-cinq jours')
  })

  it('nomme chaque palier non vide, jamais un palier vide', async () => {
    const outcome = await executorOver({
      snapshot: async () => ({ endingMissions: [mission('a', 12), mission('b', 14), mission('c', 40)] }),
    } as never).run('mission_ending', 'u1', NOW, 'w1')
    expect(outcome.notified).toBe(true)
    const body = outcome.notification?.body ?? ''
    expect(body).toContain('T-15 : 2')
    expect(body).toContain('T-45 : 1')
    expect(body).not.toContain('T-30')
    expect(body).toContain('Consultant a')
    expect(outcome.outcome).toContain('3 mission')
  })

  it('une mission sans jours connus ou hors cascade n’est jamais comptée dans un palier', async () => {
    const outcome = await executorOver({
      snapshot: async () => ({ endingMissions: [mission('a', null), mission('b', 60), mission('c', 20)] }),
    } as never).run('mission_ending', 'u1', NOW, 'w1')
    expect(outcome.notification?.body).toContain('T-30 : 1')
    expect(outcome.outcome).toContain('1 mission')
  })
})
