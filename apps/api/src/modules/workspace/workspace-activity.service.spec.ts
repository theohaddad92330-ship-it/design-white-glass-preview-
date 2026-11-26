import { workspaceActivityEventNames } from '@bellum/contracts'
import { ProductEventEntity } from '../../database/entities/product-event.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'
import type { WorkspaceContextService } from './workspace-context.service'
import { WorkspaceActivityService } from './workspace-activity.service'

const WS = 'a5b2f9be-8c0e-4f9d-b0aa-1a2b3c4d5e6f'
const ACTOR = 'b5b2f9be-8c0e-4f9d-b0aa-1a2b3c4d5e6f'

function rawRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    event_id: 'c5b2f9be-8c0e-4f9d-b0aa-1a2b3c4d5e6f',
    event_name: 'analysis_started',
    user_id: ACTOR,
    properties: { accountId: 'x', scope_mode: 'groupe' },
    occurred_at: new Date('2026-07-16T10:00:00.000Z'),
    actor_first_name: 'Léa',
    actor_last_name: 'Martin',
    actor_email: 'lea@esn.fr',
    account_name: 'Doctolib',
    contact_name: null,
    ...overrides,
  }
}

describe('WorkspaceActivityService', () => {
  let service: WorkspaceActivityService
  let events: MockRepository<ProductEventEntity>
  let context: { resolveActiveWorkspace: jest.Mock }

  beforeEach(() => {
    events = createMockRepository<ProductEventEntity>()
    context = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WS, role: 'admin' }) }
    service = new WorkspaceActivityService(events as never, context as unknown as WorkspaceContextService)
  })

  it('scopes STRICTLY to the resolved active workspace (never another tenant)', async () => {
    await service.list(ACTOR, {})

    // The base predicate pins the workspace id resolved server-side — the
    // client can NOT choose the workspace, so another tenant's events are
    // unreachable by construction.
    expect(context.resolveActiveWorkspace).toHaveBeenCalledWith(ACTOR)
    expect(events._qb.where).toHaveBeenCalledWith('event.workspace_id = :workspaceId', { workspaceId: WS })
    // And the joined labels are pinned to the SAME workspace as the event.
    const joins = events._qb.leftJoin.mock.calls.map(call => String(call[2]))
    expect(joins.some(cond => cond.includes('account.workspace_id = event.workspace_id'))).toBe(true)
    expect(joins.some(cond => cond.includes('contact.workspace_id = event.workspace_id'))).toBe(true)
  })

  it('restricts to the audit event set by default (analytics-only events stay out)', async () => {
    await service.list(ACTOR, {})
    expect(events._qb.andWhere).toHaveBeenCalledWith('event.event_name IN (:...eventNames)', {
      eventNames: [...workspaceActivityEventNames],
    })
    const [, params] = events._qb.andWhere.mock.calls[0] as [string, { eventNames: string[] }]
    expect(params.eventNames).not.toContain('account_viewed')
    expect(params.eventNames).not.toContain('plan_changed')
  })

  it('applies the member / event / period filters', async () => {
    await service.list(ACTOR, { actorId: ACTOR, event: 'member_invited', period: '30d' })

    expect(events._qb.andWhere).toHaveBeenCalledWith('event.event_name IN (:...eventNames)', {
      eventNames: ['member_invited'],
    })
    expect(events._qb.andWhere).toHaveBeenCalledWith('event.user_id = :actorId', { actorId: ACTOR })
    const periodCall = events._qb.andWhere.mock.calls.find(call => String(call[0]).includes('occurred_at'))
    expect(periodCall).toBeDefined()
    const { periodStart } = periodCall![1] as { periodStart: Date }
    const daysAgo = (Date.now() - periodStart.getTime()) / 86_400_000
    expect(daysAgo).toBeGreaterThan(29)
    expect(daysAgo).toBeLessThan(31)
  })

  it('maps a row to actor + target + detail and builds offset pagination', async () => {
    events._qb.getCount.mockResolvedValue(51)
    events._qb.getRawMany.mockResolvedValue([rawRow()])

    const page = await service.list(ACTOR, { offset: 25, limit: 25 })

    expect(events._qb.offset).toHaveBeenCalledWith(25)
    expect(events._qb.limit).toHaveBeenCalledWith(25)
    expect(page.pagination).toEqual({
      currentPage: 2,
      size: 25,
      totalItems: 51,
      totalPages: 3,
      hasNext: true,
      hasPrev: true,
    })
    expect(page.data[0]).toEqual({
      id: 'c5b2f9be-8c0e-4f9d-b0aa-1a2b3c4d5e6f',
      event: 'analysis_started',
      actor: { id: ACTOR, name: 'Léa Martin', email: 'lea@esn.fr' },
      target: 'Doctolib',
      detail: 'groupe',
      occurredAt: '2026-07-16T10:00:00.000Z',
    })
  })

  it('labels team events from their sanitized properties (invited email + role)', async () => {
    events._qb.getRawMany.mockResolvedValue([
      rawRow({
        event_name: 'member_invited',
        properties: { target: 'collab@esn.fr', role: 'sales' },
        account_name: null,
        actor_first_name: null,
        actor_last_name: null,
        actor_email: null,
      }),
    ])

    const page = await service.list(ACTOR, {})
    expect(page.data[0]!.target).toBe('collab@esn.fr')
    expect(page.data[0]!.detail).toBe('sales')
    // Missing profile → nullable identity, never a crash.
    expect(page.data[0]!.actor).toEqual({ id: ACTOR, name: null, email: null })
  })

  it('labels message/export/integration events with channel, destination and provider', async () => {
    events._qb.getRawMany.mockResolvedValue([
      rawRow({
        event_name: 'message_sent',
        properties: { channel: 'email' },
        account_name: null,
        contact_name: 'Jean Dupont',
      }),
      rawRow({ event_name: 'export_performed', properties: { destination: 'hubspot' }, account_name: null }),
      rawRow({ event_name: 'integration_connected', properties: { provider: 'slack' }, account_name: null }),
    ])

    const page = await service.list(ACTOR, {})
    expect(page.data[0]).toMatchObject({ event: 'message_sent', target: 'Jean Dupont', detail: 'email' })
    expect(page.data[1]).toMatchObject({ event: 'export_performed', target: 'hubspot', detail: 'hubspot' })
    expect(page.data[2]).toMatchObject({ event: 'integration_connected', target: 'slack', detail: null })
  })
})
