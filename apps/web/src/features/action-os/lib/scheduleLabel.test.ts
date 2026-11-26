import { describe, expect, it } from 'vitest'
import type { RoutineView } from '@bellum/contracts'
import { describeSchedule, formatRoutineHour, partitionScheduled } from './scheduleLabel'

function routine(over: {
  cadence?: RoutineView['definition']['cadence']
  enabled?: boolean
  blockers?: RoutineView['blockers']
  hour?: number
  weekday?: number | null
}): RoutineView {
  return {
    definition: {
      key: 'daily_briefing',
      name: { fr: 'Brief', en: 'Brief' },
      description: { fr: '', en: '' },
      outcome: { fr: '', en: '' },
      cadence: over.cadence ?? 'daily',
      defaultHour: 8,
      defaultWeekday: null,
      requires: [],
      defaultChannel: 'in_app',
      defaultEnabled: true,
      automationLevel: 'n4_bounded_auto' as const,
      condition: { fr: 'Une condition de test suffisamment longue.', en: 'A test condition long enough.' },
      reads: { fr: 'Ce que la routine de test lit, en une phrase.', en: 'What the test routine reads, in a sentence.' },
      fallback: { fr: 'Ce qu’elle fait quand elle ne peut pas.', en: 'What it does when it cannot.' },
      acceptance: { fr: 'Comment on prouve qu’elle marche.', en: 'How we prove it works.' },
      example: null,
      stopCondition: null,
      version: 1,
      roles: ['general'],
      workspaceProfiles: ['staffing', 'forfait_conseil'],
      scope: 'personal',
      steps: ['read', 'notify'],
      preparedActions: ['notification'],
      validations: ['review_before_acting'],
      budget: 'no_model_call',
    },
    subscription: {
      key: 'daily_briefing',
      status: (over.enabled ?? true) ? 'active' : 'paused',
      enabled: over.enabled ?? true,
      hour: over.hour ?? 8,
      weekday: over.weekday ?? null,
      channel: 'in_app',
      timeZone: 'Europe/Paris',
      maxItemsPerRun: null,
      autonomy: null,
      ownerUserId: null,
    },
    blockers: over.blockers ?? [],
    lastRunAt: null,
    lastOutcome: null,
    nextTriggerAt: null,
    updated: false,
  } as RoutineView
}

describe('formatRoutineHour', () => {
  it('rend une heure sur deux chiffres', () => {
    expect(formatRoutineHour(8)).toBe('08:00')
    expect(formatRoutineHour(17)).toBe('17:00')
  })

  it('borne une valeur aberrante plutôt que d’afficher n’importe quoi', () => {
    expect(formatRoutineHour(-3)).toBe('00:00')
    expect(formatRoutineHour(99)).toBe('23:00')
    expect(formatRoutineHour(Number.NaN)).toBe('00:00')
  })
})

describe('describeSchedule', () => {
  it('donne une clé par cadence', () => {
    expect(describeSchedule(routine({ cadence: 'daily' })).key).toBe('schedule.daily')
    expect(describeSchedule(routine({ cadence: 'weekdays' })).key).toBe('schedule.weekdays')
    expect(describeSchedule(routine({ cadence: 'monthly' })).key).toBe('schedule.monthly')
    expect(describeSchedule(routine({ cadence: 'quarterly' })).key).toBe('schedule.quarterly')
  })

  it('une routine attachée à un objet ne prétend pas avoir une heure', () => {
    const descriptor = describeSchedule(routine({ cadence: 'continuous' }))
    expect(descriptor.key).toBe('schedule.continuous')
  })

  it('porte l’heure ET le fuseau de l’abonnement — l’heure serveur ne veut rien dire ici', () => {
    const descriptor = describeSchedule(routine({ cadence: 'daily', hour: 7 }))
    expect(descriptor.params).toMatchObject({ time: '07:00', zone: 'Europe/Paris' })
  })

  it('une cadence hebdomadaire porte son jour, avec un repli quand il manque', () => {
    expect(describeSchedule(routine({ cadence: 'weekly', weekday: 4 })).params.weekday).toBe(4)
    expect(describeSchedule(routine({ cadence: 'weekly', weekday: null })).params.weekday).toBe(1)
  })
})

describe('partitionScheduled', () => {
  it('une routine désactivée n’est pas planifiée', () => {
    const { active, blocked } = partitionScheduled([routine({ enabled: false })])
    expect(active).toHaveLength(0)
    expect(blocked).toHaveLength(0)
  })

  it('une routine activée mais sans sa capacité reste VISIBLE, à part', () => {
    const { active, blocked } = partitionScheduled([
      routine({ enabled: true }),
      routine({ enabled: true, blockers: ['mailbox_not_connected'] as RoutineView['blockers'] }),
    ])
    expect(active).toHaveLength(1)
    expect(blocked).toHaveLength(1)
  })
})
