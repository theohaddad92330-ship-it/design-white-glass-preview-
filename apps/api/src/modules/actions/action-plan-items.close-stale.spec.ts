import { NotFoundException } from '@nestjs/common'
import { ActionPlanItemsService } from './action-plan-items.service'
import type { ActionPlanItemEntity } from '../../database/entities/action-plan-item.entity'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

/**
 * #4485 — « Proposer de les clore » : la clôture en lot ne ferme que les actions de L'UTILISATEUR,
 * ouvertes et vieilles de plus de 30 jours, par un geste DÉCLARATIF (jamais une preuve d'envoi).
 */
const DAY = 86_400_000
const isoDaysAgo = (days: number): string => new Date(Date.now() - days * DAY).toISOString().slice(0, 10)

const ID_A = '11111111-1111-4111-8111-111111111111'
const ID_B = '22222222-2222-4222-8222-222222222222'
const ID_RECENT = '33333333-3333-4333-8333-333333333333'
const ID_DONE = '44444444-4444-4444-8444-444444444444'
const ID_OTHER = '55555555-5555-4555-8555-555555555555'

function item(id: string, overrides: Partial<ActionPlanItemEntity> = {}): ActionPlanItemEntity {
  return {
    id,
    user_id: 'user-1',
    assigned_to: null,
    account_id: 'acc-1',
    label: 'Relancer',
    due_date: isoDaysAgo(90),
    done: false,
    execution_status: 'todo',
    outcome: null,
    completion_mode: null,
    completed_at: null,
    snoozed_until: null,
    ...overrides,
  } as ActionPlanItemEntity
}

describe('ActionPlanItemsService.closeStale — #4485', () => {
  let service: ActionPlanItemsService
  let items: MockRepository<ActionPlanItemEntity>
  let stored: Map<string, ActionPlanItemEntity>

  beforeEach(() => {
    items = createMockRepository<ActionPlanItemEntity>()
    stored = new Map(
      [
        item(ID_A),
        item(ID_B, { due_date: isoDaysAgo(45) }),
        item(ID_RECENT, { due_date: isoDaysAgo(5) }),
        item(ID_DONE, { done: true, execution_status: 'done' }),
        item(ID_OTHER, { user_id: 'user-2' }),
      ].map(row => [row.id, row]),
    )
    items.find.mockImplementation(async (options: { where: { id: { _value: string[] } } }) =>
      options.where.id._value.map(id => stored.get(id)).filter((row): row is ActionPlanItemEntity => Boolean(row)),
    )
    items.findOne.mockImplementation(
      async (options: { where: Array<{ id: string; user_id?: string; assigned_to?: string }> }) => {
        const found = stored.get(options.where[0]!.id)
        return found &&
          options.where.some(
            clause =>
              (clause.user_id !== undefined && clause.user_id === found.user_id) ||
              (clause.assigned_to !== undefined && clause.assigned_to === found.assigned_to),
          )
          ? found
          : null
      },
    )
    items.save.mockImplementation(async (row: ActionPlanItemEntity) => row)
    const workspace = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
      getMembership: jest.fn(),
      extraPermissionsOf: jest.fn().mockResolvedValue([]),
    }
    service = new ActionPlanItemsService(
      items as never,
      createMockRepository() as never,
      createMockRepository() as never,
      createMockRepository() as never,
      workspace as unknown as WorkspaceContextService,
      createMockRepository() as never,
    )
  })

  it('marque faites les actions anciennes de l’utilisateur — geste déclaratif, jamais une preuve', async () => {
    const result = await service.closeStale('user-1', [ID_A, ID_B])

    expect(result).toEqual({ closed: 2, skipped: 0, failed: 0 })
    for (const id of [ID_A, ID_B]) {
      const row = stored.get(id)!
      expect(row.done).toBe(true)
      expect(row.execution_status).toBe('done')
      expect(row.completion_mode).toBe('manual')
      expect(row.completion_mode).not.toBe('proof')
    }
  })

  it('n’en ferme jamais une récente ni une déjà faite : elles sont comptées « inchangées »', async () => {
    const result = await service.closeStale('user-1', [ID_A, ID_RECENT, ID_DONE])

    expect(result).toEqual({ closed: 1, skipped: 2, failed: 0 })
    expect(stored.get(ID_RECENT)!.done).toBe(false)
    expect(stored.get(ID_DONE)!.completion_mode).toBeNull()
  })

  it('REFUS : l’action d’un autre utilisateur fait échouer toute la demande en 404, rien n’est écrit', async () => {
    await expect(service.closeStale('user-1', [ID_A, ID_OTHER])).rejects.toBeInstanceOf(NotFoundException)

    expect(items.save).not.toHaveBeenCalled()
    expect(stored.get(ID_A)!.done).toBe(false)
    expect(stored.get(ID_OTHER)!.done).toBe(false)
  })

  it('REFUS : un identifiant inconnu est introuvable, sans distinguer « pas à toi » de « inexistant »', async () => {
    await expect(service.closeStale('user-1', [ID_A, '66666666-6666-4666-8666-666666666666'])).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(items.save).not.toHaveBeenCalled()
  })

  it('une action déléguée À l’utilisateur est la sienne', async () => {
    stored.set(ID_OTHER, item(ID_OTHER, { user_id: 'user-2', assigned_to: 'user-1' }))
    await expect(service.closeStale('user-1', [ID_OTHER])).resolves.toMatchObject({ closed: 1 })
  })
})
