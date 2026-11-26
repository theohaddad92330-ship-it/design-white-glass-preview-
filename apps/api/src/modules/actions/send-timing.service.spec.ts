import { SEND_TIMING_MIN_ATTEMPTS } from '@bellum/contracts'
import { SendTimingService } from './send-timing.service'
import type { ActionPlanItemEntity } from '../../database/entities/action-plan-item.entity'
import type { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

function row(overrides: Record<string, unknown> = {}) {
  return {
    channel: 'email',
    completed_at: new Date('2026-09-01T08:00:00.000Z'),
    outcome: 'positive',
    contact_timezone: null,
    contact_seniority: null,
    ...overrides,
  }
}

describe('SendTimingService — #3289 (#3264.31/.32/.33)', () => {
  let items: MockRepository<ActionPlanItemEntity>
  let workspaces: MockRepository<WorkspaceEntity>
  let service: SendTimingService

  beforeEach(() => {
    items = createMockRepository<ActionPlanItemEntity>()
    workspaces = createMockRepository<WorkspaceEntity>()
    workspaces.findOne.mockResolvedValue({ timezone: 'Europe/Paris' })
    service = new SendTimingService(items as never, workspaces as never)
  })

  it('mesure les gestes FAITS de CET espace — la portée passe par le compte', async () => {
    items._qb.getRawMany.mockResolvedValueOnce([])
    await service.forWorkspace('ws-1')
    expect(items._qb.andWhere).toHaveBeenCalledWith('account.workspace_id = :workspaceId', { workspaceId: 'ws-1' })
    expect(items._qb.where).toHaveBeenCalledWith("item.execution_status = 'done'")
  })

  it('rend le créneau appris depuis les issues déclarées', async () => {
    const n = SEND_TIMING_MIN_ATTEMPTS
    items._qb.getRawMany.mockResolvedValueOnce([
      ...Array.from({ length: n }, () => row()),
      ...Array.from({ length: n }, () =>
        row({ completed_at: new Date('2026-09-01T13:00:00.000Z'), outcome: 'no_response' }),
      ),
    ])
    const timing = await service.forWorkspace('ws-1')
    expect(timing?.channels[0]?.best).toEqual({ weekday: 'tuesday', band: 'morning', answered: n, attempts: n })
  })

  it('une lecture impossible rend null — jamais « aucun créneau » qui ressemblerait à une mesure', async () => {
    items._qb.getRawMany.mockRejectedValueOnce(new Error('db down'))
    await expect(service.forWorkspace('ws-1')).resolves.toBeNull()
  })

  it('transmet le filtre de persona', async () => {
    const n = SEND_TIMING_MIN_ATTEMPTS
    items._qb.getRawMany.mockResolvedValueOnce([
      ...Array.from({ length: n }, () => row({ contact_seniority: 'director' })),
      ...Array.from({ length: n }, () => row({ contact_seniority: 'manager' })),
    ])
    const timing = await service.forWorkspace('ws-1', 'director')
    expect(timing?.seniority).toBe('director')
    expect(timing?.channels[0]?.attempts).toBe(n)
  })
})
