import { describe, expect, it } from 'vitest'
import { criticalRiskSchema, dailyBriefingSchema } from './daily-briefing.js'

describe('criticalRiskSchema (#3256, BEL-SC-227.19)', () => {
  it('accepte un compte où deux signaux de même genre convergent (deux missions en fin de contrat)', () => {
    const parsed = criticalRiskSchema.parse({
      accountId: 'acc-1',
      companyName: 'Orange',
      kinds: ['mission', 'mission'],
      count: 2,
    })
    expect(parsed.count).toBe(2)
  })

  it('refuse un compte avec un seul signal (count < 2)', () => {
    expect(() =>
      criticalRiskSchema.parse({ accountId: 'acc-1', companyName: 'Orange', kinds: ['financial'], count: 1 }),
    ).toThrow()
  })
})

describe('dailyBriefingSchema.criticalRisks', () => {
  it('retombe sur une liste vide quand le champ est absent (déploiement en cours)', () => {
    const parsed = dailyBriefingSchema.parse({
      date: '2026-09-29',
      timeZone: 'Europe/Paris',
      firstName: null,
      agenda: {
        state: 'ready',
        reason: null,
        events: [],
        needsPreparation: [],
        conflicts: [],
        unfollowedMeetings: [],
      },
      mail: { state: 'not_connected', reason: null, awaitingReply: [], unread: [], positiveReplies: [] },
      tasks: { state: 'ready', reason: null, tasks: [], overdueCount: 0, todayCount: 0 },
      protectedTime: null,
      agendaPreferences: {},
      accountsToWatch: [],
      discoverAlerts: [],
      discoverAlertsLastEventAt: null,
      chainBlockers: [],
      runningJobs: [],
      actions: [],
      generatedAt: '2026-09-29T06:00:00.000Z',
    })
    expect(parsed.criticalRisks).toEqual([])
  })
})
