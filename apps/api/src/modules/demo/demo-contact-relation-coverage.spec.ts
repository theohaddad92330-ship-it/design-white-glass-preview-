import { seatName } from './demo-seat-names'
import { summarizeContactRelation } from '@bellum/contracts'
import { DEMO_ACTIVITIES, DEMO_PLAN_TASKS } from './demo-dataset'

/**
 * #3691 (craft rule n°9) — la salle de démonstration montre « où en est la
 * relation » sur UN siège de décision : une tentative, une réponse, une
 * nouvelle tentative restée sans réponse, une relance en retard et une action
 * future. Le résumé est calculé par le MÊME code que l'écran
 * (`summarizeContactRelation`), pas par une réimplémentation.
 */
const SEAT = seatName('Directeur des systèmes d’information groupe')
const NOW = new Date('2026-10-05T10:00:00Z')

describe('démo — le résumé de relation du contact (#3691)', () => {
  const activities = DEMO_ACTIVITIES.filter(a => a.contact === SEAT).map((a, index) => ({
    id: `a${index}`,
    kind: a.kind,
    direction: a.direction,
    occurredAt: new Date(NOW.getTime() - a.daysAgo * 86_400_000).toISOString(),
  }))
  const planItems = DEMO_PLAN_TASKS.filter(t => t.contact === SEAT && t.executionStatus !== 'done').map((t, index) => ({
    id: `p${index}`,
    label: t.label,
    due_date:
      t.dueInDays === null ? null : new Date(NOW.getTime() + t.dueInDays * 86_400_000).toISOString().slice(0, 10),
    execution_status: 'todo',
    owner_name: t.ownerName,
    outcome: null,
    result: null,
    completed_at: null,
  }))

  it('une tentative, une réponse enregistrée, puis une tentative SANS réponse (messagerie lue)', () => {
    const summary = summarizeContactRelation({ activities, planItems, repliesReadable: true, now: NOW })
    expect(summary.lastExchange).not.toBeNull()
    expect(summary.lastAttempt).not.toBeNull()
    expect(Date.parse(summary.lastAttempt!.at)).toBeGreaterThan(Date.parse(summary.lastExchange!.at))
    expect(summary.awaitingReply).toBe('yes')
  })

  it('la relance en retard passe en premier, l’action future reste derrière « + 1 autre »', () => {
    const summary = summarizeContactRelation({ activities, planItems, repliesReadable: true, now: NOW })
    expect(summary.next?.state).toBe('overdue')
    expect(summary.otherOpenCount).toBeGreaterThanOrEqual(1)
  })
})
