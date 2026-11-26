import { FindOperator, type Repository } from 'typeorm'
import { WorkspaceProgressService } from './workspace-progress.service'

// #5011.1 — l'état d'espace COMPTÉ : lecture filtrée `workspace_id`, jamais celui d'un autre espace.
function repo(rows: Array<{ workspace_id: string | null; status?: string; action_type?: string }>) {
  return {
    count: jest.fn(
      async ({ where }: { where: Record<string, unknown> }) =>
        rows.filter(row =>
          Object.entries(where).every(([key, expected]) => {
            const cell = (row as Record<string, unknown>)[key]
            return expected instanceof FindOperator ? (expected.value as unknown[]).includes(cell) : cell === expected
          }),
        ).length,
    ),
  } as unknown as Repository<never> & { count: jest.Mock }
}

describe('WorkspaceProgressService (#5011.1)', () => {
  const accounts = repo([
    { workspace_id: 'ws-1', status: 'completed' },
    { workspace_id: 'ws-1', status: 'completed' },
    { workspace_id: 'ws-1', status: 'deleted' },
    { workspace_id: 'ws-2', status: 'completed' },
  ])
  const contacts = repo([{ workspace_id: 'ws-1' }, { workspace_id: 'ws-2' }, { workspace_id: 'ws-2' }])
  const actions = repo([
    { workspace_id: 'ws-1', action_type: 'message_sent' },
    { workspace_id: 'ws-1', action_type: 'plan_action_message_generated' },
    // #5011 — une action d'une autre nature ne compte pas
    { workspace_id: 'ws-1', action_type: 'analysis_started' },
    { workspace_id: 'ws-1', action_type: 'plan_action_completed' },
    { workspace_id: 'ws-2', action_type: 'plan_action_message_sent' },
  ])
  const service = new WorkspaceProgressService(accounts as never, contacts as never, actions as never)

  it('compte les comptes analysés, contacts et actions DE L’ESPACE', async () => {
    await expect(service.read('ws-1')).resolves.toEqual({ accounts: 2, contacts: 1, actions: 2 })
  })

  it('REFUS — un autre espace n’est jamais compté', async () => {
    await expect(service.read('ws-2')).resolves.toEqual({ accounts: 1, contacts: 2, actions: 1 })
    await expect(service.read('ws-inconnu')).resolves.toEqual({ accounts: 0, contacts: 0, actions: 0 })
  })
})
