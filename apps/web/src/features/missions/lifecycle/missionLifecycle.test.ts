import { describe, expect, it } from 'vitest'
import { MISSION_LIFECYCLE_STAGES, missionLifecycleStage } from './missionLifecycle'

const NOW = new Date('2026-10-22T10:00:00Z')

describe('missionLifecycleStage — Théo C missions-dossier.N1', () => {
  it('garde les cinq étapes de Théo, dans l’ordre', () => {
    expect(MISSION_LIFECYCLE_STAGES).toEqual(['agreement', 'start', 'mission', 'handover', 'closure'])
  })

  it.each([
    ['draft', 'agreement'],
    ['onboarding', 'start'],
    ['ready_to_start', 'start'],
    ['active', 'mission'],
    ['at_risk', 'mission'],
    ['paused', 'mission'],
    ['renewal_pending', 'mission'],
    ['ending', 'handover'],
    ['ended', 'closure'],
    ['completed', 'closure'],
    ['terminated', 'closure'],
    ['renewed', 'closure'],
    ['cancelled', 'closure'],
    ['archived', 'closure'],
  ] as const)('statut %s → étape %s', (status, stage) => {
    expect(missionLifecycleStage({ status, endsOn: null }, NOW)).toBe(stage)
  })

  it('« Passation » : une mission en cours qui finit dans les 30 jours passe en passation', () => {
    expect(missionLifecycleStage({ status: 'active', endsOn: '2026-11-10' }, NOW)).toBe('handover')
  })

  it('une fin lointaine ou déjà passée ne déclenche pas la passation', () => {
    expect(missionLifecycleStage({ status: 'active', endsOn: '2027-03-01' }, NOW)).toBe('mission')
    expect(missionLifecycleStage({ status: 'active', endsOn: '2026-09-01' }, NOW)).toBe('mission')
  })

  it('une date de fin illisible ne se devine pas', () => {
    expect(missionLifecycleStage({ status: 'active', endsOn: 'pas une date' }, NOW)).toBe('mission')
  })
})
