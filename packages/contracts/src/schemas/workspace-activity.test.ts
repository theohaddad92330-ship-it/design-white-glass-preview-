import { describe, expect, it } from 'vitest'

import {
  workspaceActivityEventNames,
  workspaceActivityItemSchema,
  workspaceActivityQuerySchema,
} from './workspace-activity.js'

describe('workspaceActivityQuerySchema', () => {
  it('accepts an empty query (all filters optional)', () => {
    expect(workspaceActivityQuerySchema.parse({})).toEqual({})
  })

  it('coerces offset/limit from query-string values', () => {
    const parsed = workspaceActivityQuerySchema.parse({ offset: '25', limit: '50' })
    expect(parsed.offset).toBe(25)
    expect(parsed.limit).toBe(50)
  })

  it('refuses an unknown event name and an out-of-range limit', () => {
    expect(workspaceActivityQuerySchema.safeParse({ event: 'password_read' }).success).toBe(false)
    expect(workspaceActivityQuerySchema.safeParse({ limit: 101 }).success).toBe(false)
    expect(workspaceActivityQuerySchema.safeParse({ offset: -1 }).success).toBe(false)
  })

  it('accepts every audit event name as a filter', () => {
    for (const event of workspaceActivityEventNames) {
      expect(workspaceActivityQuerySchema.safeParse({ event }).success).toBe(true)
    }
  })
})

describe('workspaceActivityItemSchema', () => {
  it('validates a journal line with nullable actor identity and target', () => {
    const parsed = workspaceActivityItemSchema.parse({
      id: 'f5b2f9be-8c0e-4f9d-b0aa-1a2b3c4d5e6f',
      event: 'member_invited',
      actor: { id: 'a5b2f9be-8c0e-4f9d-b0aa-1a2b3c4d5e6f', name: null, email: null },
      target: 'collab@esn.fr',
      detail: 'sales',
      occurredAt: '2026-07-16T10:00:00.000Z',
    })
    expect(parsed.event).toBe('member_invited')
  })

  it('refuses an event outside the audit set', () => {
    const result = workspaceActivityItemSchema.safeParse({
      id: 'f5b2f9be-8c0e-4f9d-b0aa-1a2b3c4d5e6f',
      event: 'account_viewed',
      actor: { id: 'a5b2f9be-8c0e-4f9d-b0aa-1a2b3c4d5e6f', name: null, email: null },
      target: null,
      detail: null,
      occurredAt: '2026-07-16T10:00:00.000Z',
    })
    expect(result.success).toBe(false)
  })
})
