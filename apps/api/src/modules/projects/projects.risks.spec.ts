import { NotFoundException } from '@nestjs/common'
import { ProjectsService } from './projects.service'
import { ProjectsController } from './projects.controller'
import { REQUIRE_PERMISSION_KEY } from '../workspace/require-permission.decorator'
import type { ProjectEntity } from '../../database/entities/project.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

/**
 * #2324.37 — LE RISQUE D'UNE OPPORTUNITÉ : écrit par la même porte que le
 * montant (`PATCH /projects/:id/risks`, `records:write`, espace vérifié), lu
 * par la même projection que la fiche.
 */
describe('ProjectsService.updateRisks (#2324.37)', () => {
  let repo: MockRepository<ProjectEntity>
  let service: ProjectsService

  beforeEach(() => {
    repo = createMockRepository<ProjectEntity>()
    service = new ProjectsService(repo as never)
  })

  it('écrit le risque dans l’espace et rend la ligne (projection qui porte `risks`)', async () => {
    const row = { id: 'op-1', risks: 'Budget non voté' }
    repo.manager.query.mockResolvedValue([row])
    const result = await service.updateRisks('op-1', 'ws-1', 'Budget non voté')
    const [sql, params] = repo.manager.query.mock.calls[0] as [string, unknown[]]
    expect(params).toEqual(['op-1', 'ws-1', 'Budget non voté'])
    expect(sql).toContain('UPDATE opportunities')
    expect(sql).toContain('SET risks = $3')
    expect(sql).toContain('o.workspace_id = $2 OR a.workspace_id = $2')
    expect(sql).toContain("a.status <> 'deleted'")
    expect(sql).toContain('o.risks')
    expect(result).toEqual(row)
  })

  it('null efface ; hors espace ou erreur → null, jamais d’exception', async () => {
    repo.manager.query.mockResolvedValue([])
    await expect(service.updateRisks('op-1', 'ws-1', null)).resolves.toBeNull()
    expect((repo.manager.query.mock.calls[0] as [string, unknown[]])[1]).toEqual(['op-1', 'ws-1', null])
    repo.manager.query.mockRejectedValue(new Error('boom'))
    await expect(service.updateRisks('op-1', 'ws-1', 'x')).resolves.toBeNull()
  })
})

describe('ProjectsController.updateRisks (#2324.37)', () => {
  const workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }) }
  const call = (projects: unknown) =>
    ProjectsController.prototype.updateRisks.call(
      { projects, workspaceContext } as never,
      'op-1',
      { risks: 'Concurrent en place' },
      { userId: 'u-1' } as never,
    )

  it('écrit sur l’espace ACTIF de l’appelant', async () => {
    const projects = { updateRisks: jest.fn().mockResolvedValue({ id: 'op-1', risks: 'Concurrent en place' }) }
    await expect(call(projects)).resolves.toEqual({ id: 'op-1', risks: 'Concurrent en place' })
    expect(projects.updateRisks).toHaveBeenCalledWith('op-1', 'ws-1', 'Concurrent en place')
  })

  it('hors espace : 404', async () => {
    await expect(call({ updateRisks: jest.fn().mockResolvedValue(null) })).rejects.toBeInstanceOf(NotFoundException)
  })

  it('exige records:write, comme le montant', () => {
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, ProjectsController.prototype.updateRisks)).toEqual([
      'records:write',
    ])
  })
})
