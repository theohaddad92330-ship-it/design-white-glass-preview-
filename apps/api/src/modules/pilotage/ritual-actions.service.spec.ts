import type { Repository } from 'typeorm'
import type { TaskEntity } from '../../database/entities/task.entity'
import { RitualActionsService } from './ritual-actions.service'

function serviceWith(rows: unknown[]) {
  const query = jest.fn(async () => rows)
  const service = new RitualActionsService({ query } as unknown as Repository<TaskEntity>)
  return { service, query }
}

describe('RitualActionsService', () => {
  it("compte les tâches taguées, scopé à l'espace", async () => {
    const { service, query } = serviceWith([
      { ritual_key: 'monthly', count: 3 },
      { ritual_key: 'weekly', count: '1' },
    ])
    await expect(service.forWorkspace('ws-1')).resolves.toEqual([
      { ritualKey: 'monthly', count: 3 },
      { ritualKey: 'weekly', count: 1 },
    ])
    const [sql, params] = query.mock.calls[0] as unknown as [string, string[]]
    expect(sql).toContain('workspace_id = $1')
    expect(sql).toContain('ritual_key IS NOT NULL')
    expect(params).toEqual(['ws-1'])
  })

  it('aucune tâche taguée → aucune ligne, jamais un « 0 » par rituel', async () => {
    const { service } = serviceWith([])
    await expect(service.forWorkspace('ws-1')).resolves.toEqual([])
  })

  it('écarte un compte nul — une absence ne fait aucune ligne', async () => {
    const { service } = serviceWith([{ ritual_key: 'daily', count: 0 }])
    await expect(service.forWorkspace('ws-1')).resolves.toEqual([])
  })
})
