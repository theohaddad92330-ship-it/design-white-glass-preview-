import type { OutreachCallTask } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { upcomingCallsOf } from './useContactCallTasks'

const task = (over: Partial<OutreachCallTask>) =>
  ({ id: 'x', contact_id: 'c1', status: 'scheduled', ...over }) as OutreachCallTask

describe('upcomingCallsOf (#3697.7)', () => {
  it('ne garde que les appels À VENIR du contact', () => {
    const tasks = [
      task({ id: 'a', status: 'scheduled' }),
      task({ id: 'b', status: 'callback' }),
      task({ id: 'c', status: 'completed' }),
      task({ id: 'd', status: 'no_answer' }),
      task({ id: 'e', contact_id: 'c2' }),
    ]
    expect(upcomingCallsOf(tasks, 'c1').map(item => item.id)).toEqual(['a', 'b'])
  })

  it('SAIT DIRE NON — un appel passé ou annulé n’est jamais « à passer »', () => {
    const past = (['completed', 'no_answer', 'wrong_person', 'qualified', 'refused', 'cancelled'] as const).map(
      status => task({ status }),
    )
    expect(upcomingCallsOf(past, 'c1')).toEqual([])
  })
})
