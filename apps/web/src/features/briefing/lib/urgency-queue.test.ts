import type { BriefingAction } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { orderByUrgency } from './urgency-queue'

const NOW = new Date('2026-10-22T08:00:00Z')

const card = (id: string, kind: BriefingAction['kind'], expiresAt: string | null = null): BriefingAction =>
  ({ id, kind, expiresAt }) as unknown as BriefingAction

describe('orderByUrgency', () => {
  it('range l’urgent avant l’important, l’opportunité, puis l’administratif', () => {
    const queue = orderByUrgency(
      [card('t', 'task'), card('a', 'account'), card('r', 'reply'), card('m', 'mission_end')],
      NOW,
    )
    expect(queue.map(action => action.id)).toEqual(['m', 'r', 'a', 't'])
  })

  it('garde l’ordre du serveur à urgence égale (tri stable)', () => {
    const queue = orderByUrgency([card('r2', 'reply'), card('r1', 'follow_up'), card('r3', 'meeting_prep')], NOW)
    expect(queue.map(action => action.id)).toEqual(['r2', 'r1', 'r3'])
  })

  it('une échéance dans l’heure fait basculer n’importe quel genre en urgent', () => {
    const soon = new Date(NOW.getTime() + 20 * 60_000).toISOString()
    const queue = orderByUrgency([card('r', 'reply'), card('t', 'task', soon)], NOW)
    expect(queue[0]?.id).toBe('t')
  })

  it('ne mute pas l’entrée et accepte une file vide', () => {
    const input = [card('t', 'task'), card('m', 'mission_end')]
    orderByUrgency(input, NOW)
    expect(input.map(action => action.id)).toEqual(['t', 'm'])
    expect(orderByUrgency([], NOW)).toEqual([])
  })
})
