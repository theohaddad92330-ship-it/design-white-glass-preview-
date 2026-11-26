import type { WorkflowRunEntity } from '../../database/entities/workflow-run.entity'
import { createMockRepository } from '../../database/test-utils'
import { ActionOsController } from './action-os.controller'

/**
 * X37 / #3416 — LA PROCHAINE ACTION D'UN RUN TERMINÉ A UNE SOURCE.
 *
 * Le run ne porte aucune « prochaine action » : la source est la tâche OUVERTE
 * la plus proche d'échéance sur le MÊME compte (`tasks`), lue pour tous les
 * runs en UNE requête. Pas de tâche ouverte, pas de compte → `null`, jamais un
 * texte inventé.
 */
const USER = { userId: 'u1', email: 'rep@esn.fr' }

function build() {
  const runs = createMockRepository<WorkflowRunEntity>()
  const none = createMockRepository<never>()
  const controller = new ActionOsController(
    {} as never,
    { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }) } as never,
    {} as never,
    runs as never,
    none as never,
    none as never,
    none as never,
    none as never,
    none as never,
    {} as never,
    {} as never,
  )
  return { controller, runs }
}

const run = (id: string, account_id: string | null) =>
  ({
    id,
    workspace_id: 'ws-1',
    user_id: 'u-1',
    trigger: 'manual',
    status: 'done',
    account_id,
    definition_key: 'crm_hygiene',
    steps: [],
  }) as unknown as WorkflowRunEntity

describe('ActionOsController.listRuns — nextAction (#3416)', () => {
  it('porte la tâche ouverte la plus proche du MÊME compte, et null sans compte ni tâche', async () => {
    const { controller, runs } = build()
    runs.find.mockResolvedValue([run('r1', 'acc-1'), run('r2', 'acc-2'), run('r3', null)])
    runs.manager.query.mockImplementation(async (sql: string) =>
      /FROM tasks/.test(sql)
        ? [{ account_id: 'acc-1', title: 'Relancer sur les deux profils conformité', due_on: '2026-09-30' }]
        : [],
    )

    const { runs: out } = await controller.listRuns(USER as never)
    const byId = new Map(out.map(item => [item.id, item.nextAction]))

    expect(byId.get('r1')).toEqual({ title: 'Relancer sur les deux profils conformité', dueOn: '2026-09-30' })
    expect(byId.get('r2')).toBeNull()
    expect(byId.get('r3')).toBeNull()
  })

  // #3416 (recette prod 08→09/10 : carte Sanofi sans « Prochaine action ») — sans tâche ouverte, la
  // prochaine action ÉCRITE par le commercial sur sa liste cible (`target_list_items.next_action`)
  // la remplace. Une tâche ouverte l'emporte toujours ; rien d'écrit nulle part ⇒ null.
  it('#3416 — sans tâche ouverte, la prochaine action écrite sur la liste cible du compte la remplace', async () => {
    const { controller, runs } = build()
    runs.find.mockResolvedValue([run('r1', 'acc-1'), run('r2', 'acc-2'), run('r3', 'acc-3')])
    runs.manager.query.mockImplementation(async (sql: string) => {
      if (/FROM tasks/.test(sql)) return [{ account_id: 'acc-1', title: 'Appeler la DSI', due_on: '2026-09-30' }]
      if (/FROM target_list_items/.test(sql))
        return [
          { account_id: 'acc-1', next_action: 'Texte de liste qui ne doit PAS gagner' },
          { account_id: 'acc-2', next_action: 'Obtenir le nom de l’acheteur référent' },
        ]
      return []
    })

    const { runs: out } = await controller.listRuns(USER as never)
    const byId = new Map(out.map(item => [item.id, item.nextAction]))

    expect(byId.get('r1')).toEqual({ title: 'Appeler la DSI', dueOn: '2026-09-30' })
    expect(byId.get('r2')).toEqual({ title: 'Obtenir le nom de l’acheteur référent', dueOn: null })
    expect(byId.get('r3')).toBeNull()
  })

  it('aucune requête de tâches quand aucun run ne porte de compte', async () => {
    const { controller, runs } = build()
    runs.find.mockResolvedValue([run('r3', null)])
    await controller.listRuns(USER as never)
    const taskQueries = runs.manager.query.mock.calls.filter(([sql]) => /FROM tasks/.test(String(sql)))
    expect(taskQueries).toHaveLength(0)
  })
})
