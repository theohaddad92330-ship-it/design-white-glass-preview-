import { describe, expect, it } from 'vitest'
import { aggregateProspectingSessionMetrics, type ProspectingSessionRecord } from './prospecting-session-telemetry.js'

function record(overrides: Partial<ProspectingSessionRecord> = {}): ProspectingSessionRecord {
  return {
    journey: 'appels',
    startedAt: '2026-09-27T10:00:00.000Z',
    firstMessageAt: null,
    messagesTotal: 0,
    messagesModified: 0,
    connectorAttempts: 0,
    connectorSuccesses: 0,
    duplicatesAvoided: 0,
    ...overrides,
  }
}

describe('#2386.9 — aggregateProspectingSessionMetrics — PAR PARCOURS, jamais par personne', () => {
  it('agrège les quatre mesures pour un parcours au-dessus du plancher', () => {
    const sessions: ProspectingSessionRecord[] = Array.from({ length: 5 }, (_, i) =>
      record({
        journey: 'email',
        firstMessageAt: '2026-09-27T10:02:00.000Z', // 120s après le départ
        messagesTotal: 4,
        messagesModified: 1,
        connectorAttempts: 4,
        connectorSuccesses: 3,
        duplicatesAvoided: i === 0 ? 2 : 0,
      }),
    )
    const [metric] = aggregateProspectingSessionMetrics(sessions)
    expect(metric).toEqual({
      journey: 'email',
      sessions: 5,
      timeToFirstMessageSeconds: 120,
      modifiedMessageRate: 5 / 20,
      connectorSuccessRate: 15 / 20,
      duplicatesAvoided: 2,
    })
  })

  it('NON — sous le plancher, les trois mesures dérivées sont « non mesuré » (null), jamais 0 (GA-18/19)', () => {
    const sessions: ProspectingSessionRecord[] = [
      record({ journey: 'email', firstMessageAt: '2026-09-27T10:01:00.000Z', messagesTotal: 2, messagesModified: 2 }),
    ]
    const [metric] = aggregateProspectingSessionMetrics(sessions)
    expect(metric.sessions).toBe(1)
    expect(metric.timeToFirstMessageSeconds).toBeNull()
    expect(metric.modifiedMessageRate).toBeNull()
    expect(metric.connectorSuccessRate).toBeNull()
  })

  it('NON — un parcours au-dessus du plancher mais SANS le fait mesuré reste « non mesuré », pas 0', () => {
    const sessions: ProspectingSessionRecord[] = Array.from({ length: 5 }, () =>
      record({ journey: 'appels', firstMessageAt: null, messagesTotal: 0, connectorAttempts: 0 }),
    )
    const [metric] = aggregateProspectingSessionMetrics(sessions)
    expect(metric.timeToFirstMessageSeconds).toBeNull()
    expect(metric.modifiedMessageRate).toBeNull()
    expect(metric.connectorSuccessRate).toBeNull()
  })

  it('duplicatesAvoided reste un COMPTE brut, publié même sous le plancher', () => {
    const sessions: ProspectingSessionRecord[] = [record({ journey: 'linkedin', duplicatesAvoided: 3 })]
    const [metric] = aggregateProspectingSessionMetrics(sessions)
    expect(metric.duplicatesAvoided).toBe(3)
  })

  it('groupe PAR PARCOURS, jamais un agrégat unique mélangeant deux parcours', () => {
    const sessions: ProspectingSessionRecord[] = [
      ...Array.from({ length: 5 }, () => record({ journey: 'appels', duplicatesAvoided: 1 })),
      ...Array.from({ length: 5 }, () => record({ journey: 'email', duplicatesAvoided: 10 })),
    ]
    const metrics = aggregateProspectingSessionMetrics(sessions)
    expect(metrics).toHaveLength(2)
    expect(metrics.find(m => m.journey === 'appels')?.duplicatesAvoided).toBe(5)
    expect(metrics.find(m => m.journey === 'email')?.duplicatesAvoided).toBe(50)
  })
})
